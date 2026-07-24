/*
  User profile (Postgres `profiles` table) — the signup-time info used to assess a user's
  rights: full name, organization, job title, and requested role, plus the Settings page's own
  additions (phone, department, avatar). The row itself is created automatically by a database
  trigger on signup (see backend/supabase/migration_demo_open_access.sql's handle_new_user()),
  not by this store.

  DEMO MODE: that same migration also dropped the trigger that used to block a signed-in user
  from changing their own `role` — updateProfile() below accepts it accordingly. Revert the
  migration (re-enable RLS + restore the role-lock trigger, see schema.sql) and remove `role`
  from updateProfile()'s accepted fields to go back to admin-only role changes.
*/
import { supabase } from "./supabaseClient";

export async function getProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, organization, job_title, phone, department, avatar_url, requested_role, role")
    .maybeSingle();
  if (error) {
    console.error("getProfile failed:", error.message);
    return null;
  }
  return data;
}

// Systems -> Users page. Only returns more than the caller's own row for an admin/superadmin —
// enforced by the "admins can view all profiles" RLS policy in schema.sql, not by this function;
// a viewer calling this just gets their own single row back, same as getProfile() effectively.
export async function listAllProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, organization, job_title, requested_role, role, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Calls the promote_user_role() RPC (schema.sql) — SECURITY DEFINER, re-checks the caller is
// actually a superadmin server-side, so this isn't a client-trust boundary even though it's
// invoked from the browser.
export async function promoteUserRole(targetUserId, newRole) {
  const { error } = await supabase.rpc("promote_user_role", {
    target_user_id: targetUserId,
    new_role: newRole,
  });
  if (error) throw error;
}

// Settings page — updates the caller's own profile row. DEMO MODE: `role` is now accepted and
// editable here, since migration_demo_open_access.sql dropped the trigger that used to block a
// signed-in user from changing their own role. Revert that migration to restore admin-only role
// changes, and remove `role` from this function's accepted fields again to match.
export async function updateProfile({ fullName, organization, jobTitle, phone, department, role }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName || null,
      organization: organization || null,
      job_title: jobTitle || null,
      phone: phone || null,
      department: department || null,
      ...(role ? { role } : {}),
    })
    .eq("user_id", user.id);
  if (error) throw error;
}

// Uploads a new avatar image to the `avatars` Storage bucket (owner-scoped by path prefix —
// see schema.sql's storage.objects policies), then writes the resulting public URL onto the
// caller's own profile row. Overwrites any previous avatar at the same fixed path (`upsert:
// true`) rather than accumulating old uploads that RLS would prevent anyone from cleaning up.
export async function uploadAvatar(file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
  // Cache-bust: the URL itself doesn't change on re-upload (fixed path), so a browser that
  // already cached the old image would otherwise keep showing it after a new upload.
  const avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("user_id", user.id);
  if (updateError) throw updateError;

  return avatarUrl;
}

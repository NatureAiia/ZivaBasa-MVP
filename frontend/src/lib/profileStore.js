/*
  User profile (Postgres `profiles` table) — the signup-time info used to assess a user's
  rights: full name, organization, job title, and requested role, plus the Settings page's own
  additions (phone, department, avatar). `role` is what the app actually gates on and only ever
  changes via manual admin action (see schema.sql); this store never writes it — the "own
  profile update" RLS policy allows updating any OTHER column on your own row, enforced at the
  database layer by a trigger that rejects a `role` change from an authenticated (non-admin)
  session regardless of what a client sends.
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

export async function createProfile({ fullName, organization, jobTitle, requestedRole }) {
  const { error } = await supabase.from("profiles").insert({
    full_name: fullName || null,
    organization: organization || null,
    job_title: jobTitle || null,
    requested_role: requestedRole || "viewer",
  });
  if (error) throw error;
}

// Settings page — updates the editable subset of the caller's own profile row. `role` is
// deliberately not an accepted field here (see module docstring); passing it would be silently
// rejected by the database trigger anyway, but keeping it out of this function's signature
// means that's not even something a future caller could attempt from this store.
export async function updateProfile({ fullName, organization, jobTitle, phone, department }) {
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

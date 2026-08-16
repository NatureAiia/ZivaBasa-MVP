/*
  Referral/expansion (growth mechanic 7) — schema-only collaboration for now (organizations +
  invites tables, see backend/supabase/migration_add_engagement.sql). IMPORTANT LIMITATION,
  stated here so no UI built on top of this store implies more than it delivers: accepting an
  invite links the invitee's profile to the same `organizations` row, but org_nodes/assignments
  are NOT re-scoped to organization_id yet — that RLS rewrite is a deliberately separate, larger
  change. An accepted invite today gets its own empty workspace, not the inviter's shared org
  chart. Invite UI copy must say this plainly, not just this code comment.

  There is no email-sending integration in this codebase — "sending" an invite here means
  writing the row (which a real email step would read from later); the accept link is
  `{origin}/invite/{token}`, not wired to an actual accept-flow page yet (that page is future
  work once real collaboration — the RLS rewrite above — ships).
*/
import { supabase } from "./supabaseClient";

async function getOrCreateOwnOrganization(userId, fallbackName) {
  const { data: existing, error: existingErr } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("organizations")
    .insert({ name: fallbackName || "My organization", owner_user_id: userId })
    .select("id, name")
    .single();
  if (error) throw error;
  return data;
}

export async function getMyInvites() {
  const { data, error } = await supabase
    .from("invites")
    .select("id, email, role, status, bonus_tokens, created_at, accepted_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getMyInvites failed:", error.message);
    return [];
  }
  return data || [];
}

// bonusTokens is granted to the INVITER once the invite is accepted (a real accept-flow step,
// not implemented here yet — see module docstring) as the referral reward for mechanic 7.
export async function sendInvite(email, { organizationName, role = "admin", bonusTokens = 20 } = {}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const org = await getOrCreateOwnOrganization(user.id, organizationName);

  const { data, error } = await supabase
    .from("invites")
    .insert({
      organization_id: org.id,
      invited_by: user.id,
      email,
      role,
      bonus_tokens: bonusTokens,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

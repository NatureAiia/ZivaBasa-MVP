/*
  Referral/expansion (growth mechanic 7) — schema-only collaboration for now, backed by Postgres
  via the backend's /invites routes (backend/api/routes/organizations.py) instead of direct
  `supabase.from("organizations"/"invites")` calls. IMPORTANT LIMITATION, stated here so no UI
  built on top of this store implies more than it delivers: accepting an invite links the
  invitee's profile to the same organizations row, but org_nodes/assignments are NOT re-scoped
  to organization_id yet — that's a deliberately separate, larger change. An accepted invite
  today gets its own empty workspace, not the inviter's shared org chart. Invite UI copy must
  say this plainly, not just this code comment.

  There is no email-sending integration in this codebase — "sending" an invite here means
  writing the row (which a real email step would read from later); the accept link is
  `{origin}/invite/{token}`, not wired to an actual accept-flow page yet (that page is future
  work once real collaboration — the org-scoping rewrite above — ships).
*/
import { request } from "./api";

export async function getMyInvites() {
  try {
    return await request("/invites");
  } catch (e) {
    console.error("getMyInvites failed:", e.message);
    return [];
  }
}

// bonusTokens is granted to the INVITER once the invite is accepted (a real accept-flow step,
// not implemented here yet — see module docstring) as the referral reward for mechanic 7.
export async function sendInvite(email, { organizationName, role = "admin", bonusTokens = 20 } = {}) {
  return await request("/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      organization_name: organizationName || null,
      role,
      bonus_tokens: bonusTokens,
    }),
  });
}

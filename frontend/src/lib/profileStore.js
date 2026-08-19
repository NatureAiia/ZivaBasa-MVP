/*
  User profile — calls the backend's /profiles/* routes (backend/api/routes/profiles.py)
  instead of `supabase.from("profiles")`. `role` is what the app actually gates on and only ever
  changes via manual admin action (POST /auth/admin/promote-role); this store never writes it —
  the PATCH /profiles/me request body has no `role` field at all, so there's no way to even
  attempt setting it through this store.
*/
import { getBase } from "./api";
import { getAccessToken } from "./sessionToken";

function authHeaders() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options) {
  const res = await fetch(`${getBase()}${path}`, {
    ...options,
    credentials: "include",
    headers: { ...(options?.headers || {}), ...authHeaders() },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export async function getProfile() {
  try {
    return await request("/profiles/me");
  } catch (e) {
    console.error("getProfile failed:", e.message);
    return null;
  }
}

// Systems -> Users page. Only returns more than the caller's own row for an admin/superadmin —
// enforced by require_role("admin") on the backend, not by this function; a viewer calling this
// gets a 403 instead.
export async function listAllProfiles() {
  return (await request("/profiles")) || [];
}

// Calls POST /auth/admin/promote-role — re-checks the caller is actually a superadmin
// server-side, so this isn't a client-trust boundary even though it's invoked from the browser.
export async function promoteUserRole(targetUserId, newRole) {
  await request("/auth/admin/promote-role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_user_id: targetUserId, new_role: newRole }),
  });
}

// Settings page — updates the editable subset of the caller's own profile row.
export async function updateProfile({ fullName, organization, jobTitle, phone, department }) {
  await request("/profiles/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: fullName || null,
      organization: organization || null,
      job_title: jobTitle || null,
      phone: phone || null,
      department: department || null,
    }),
  });
}

// Uploads a new avatar image. Backed by POST /profile/avatar (local-disk storage — see
// backend/api/routes/avatar.py), replacing the Supabase `avatars` Storage bucket.
export async function uploadAvatar(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${getBase()}/profile/avatar`, {
    method: "POST",
    body: form,
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status}: ${res.statusText}`);
  }
  const { avatar_url: avatarUrl } = await res.json();
  return avatarUrl;
}

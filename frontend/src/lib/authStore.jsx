/*
  authStore.jsx — replaces Supabase Auth (signUp/signInWithPassword/signOut/onAuthStateChange)
  with calls to this backend's own POST /auth/* endpoints (backend/api/auth_routes.py).

  Session model: the access token lives ONLY in this module's React state — never localStorage/
  sessionStorage, so it can't be read by an XSS payload that isn't also live in this exact tab.
  It's also mirrored into sessionToken.js (a plain in-memory variable, not a React value) so
  api.js's synchronous authHeaders() can read it without needing to be a hook itself. The
  longer-lived refresh token is an httpOnly cookie the browser holds and this code never touches
  directly — POST /auth/refresh reads it server-side to mint a new access token, which is how a
  page reload restores a session without ever putting the refresh token in reach of JS.
*/
import { createContext, useContext, useEffect, useState } from "react";
import { getBase } from "./api";
import { setAccessToken } from "./sessionToken";
import { getProfile } from "./profileStore";

const AuthContext = createContext(null);

async function _authFetch(path, body) {
  const base = getBase();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* no body */
  }
  if (!res.ok) {
    const message = data?.detail
      ? typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)
      : `${res.status}: ${res.statusText}`;
    return { data: null, error: new Error(message) };
  }
  return { data, error: null };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { userId, role } | null
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Silent session restore on load: the refresh cookie (if any) is sent automatically by the
  // browser — a successful response means "already signed in from a previous visit".
  useEffect(() => {
    (async () => {
      const { data } = await _authFetch("/auth/refresh");
      if (data) {
        setAccessToken(data.access_token);
        setSession({ userId: data.user_id, role: data.role });
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    (async () => setProfile(await getProfile()))();
  }, [session]);

  const signUp = async (email, password, profileFields = {}) => {
    const { data, error } = await _authFetch("/auth/signup", {
      email,
      password,
      full_name: profileFields.fullName || null,
      organization: profileFields.organization || null,
      job_title: profileFields.jobTitle || null,
      requested_role: profileFields.requestedRole || "viewer",
    });
    if (error) return { error };
    setAccessToken(data.access_token);
    setSession({ userId: data.user_id, role: data.role });
    return { error: null };
  };

  const signIn = async (email, password) => {
    const { data, error } = await _authFetch("/auth/login", { email, password });
    if (error) return { error };
    setAccessToken(data.access_token);
    setSession({ userId: data.user_id, role: data.role });
    return { error: null };
  };

  const signOut = async () => {
    await _authFetch("/auth/logout");
    setAccessToken(null);
    setSession(null);
  };

  // Settings page calls this after updateProfile()/uploadAvatar() so the rest of the app (e.g.
  // any header/sidebar that shows profile fields) reflects the change without a full reload.
  const refreshProfile = async () => setProfile(await getProfile());

  const value = {
    session,
    user: session ? { id: session.userId } : null,
    profile,
    role: profile?.role ?? session?.role ?? null,
    loading,
    signedIn: Boolean(session),
    configured: true, // no separate "backend not configured" state now that there's no external service key to check
    signUp,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be used inside <AuthProvider>");
  return ctx;
}

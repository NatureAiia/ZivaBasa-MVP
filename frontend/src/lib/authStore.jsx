import { createContext, useContext, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { getProfile } from "./profileStore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    // Keeps session in sync across tabs and after token refresh — without this, a session
    // that expires or is signed out in another tab would silently go stale here.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  // Profile carries `role`, which gates admin-only UI — fetched separately from the session
  // since it lives in its own table, not the Supabase auth user object. DEMO MODE
  // (migration_demo_open_access.sql): a database trigger now creates the profile row
  // automatically on signup (reading the metadata signUp() below passes via options.data), so
  // this just reads it back — no client-side creation/stash-in-localStorage path needed
  // anymore.
  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    getProfile().then(setProfile);
  }, [session]);

  // profileFields keys (fullName/organization/jobTitle/requestedRole) map onto the same
  // snake_case metadata keys handle_new_user() reads in migration_demo_open_access.sql.
  const signUp = (email, password, profileFields) =>
    supabase.auth.signUp({
      email,
      password,
      options: profileFields
        ? {
            data: {
              full_name: profileFields.fullName || null,
              organization: profileFields.organization || null,
              job_title: profileFields.jobTitle || null,
              requested_role: profileFields.requestedRole || "viewer",
            },
          }
        : undefined,
    });

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();

  // Settings page calls this after updateProfile()/uploadAvatar() so the rest of the app (e.g.
  // any header/sidebar that shows profile fields) reflects the change without a full reload.
  const refreshProfile = async () => setProfile(await getProfile());

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    loading,
    signedIn: Boolean(session),
    configured: isSupabaseConfigured,
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

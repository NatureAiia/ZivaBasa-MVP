import { createContext, useContext, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { getProfile, createProfile } from "./profileStore";

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
  // since it lives in its own table, not the Supabase auth user object. If signup happened
  // with email confirmation on, there was no session yet to write the profile row under (RLS
  // requires auth.uid()), so the fields were stashed in localStorage — write them now that a
  // real session (post-confirmation sign-in) exists, then clear the stash either way so a
  // later sign-in by a different account never reuses stale fields.
  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    (async () => {
      const existing = await getProfile();
      if (existing) {
        setProfile(existing);
        return;
      }
      const pendingRaw = localStorage.getItem("zivabasa_pending_profile");
      if (pendingRaw) {
        localStorage.removeItem("zivabasa_pending_profile");
        try {
          await createProfile(JSON.parse(pendingRaw));
        } catch (e) {
          console.error("createProfile failed:", e.message);
        }
      }
      setProfile(await getProfile());
    })();
  }, [session]);

  const signUp = (email, password, profileFields) =>
    supabase.auth.signUp({ email, password }).then(async (result) => {
      if (result.error || !profileFields) return result;
      if (result.data.session) {
        // Email confirmation is off — a session exists immediately, write the row now.
        await createProfile(profileFields).catch((e) => console.error("createProfile failed:", e.message));
      } else {
        // No session until the user confirms their email and signs in — stash the fields for
        // the effect above to pick up at that point.
        localStorage.setItem("zivabasa_pending_profile", JSON.stringify(profileFields));
      }
      return result;
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

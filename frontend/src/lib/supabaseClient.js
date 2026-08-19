/*
  Supabase client — single shared instance for auth + all Postgres-backed stores.

  Requires two Vite env vars (see .env.example): VITE_SUPABASE_URL and
  VITE_SUPABASE_ANON_KEY. The anon key is safe to ship to the browser by design — Supabase's
  security boundary is Row Level Security (see backend/supabase/schema.sql), not key secrecy.
*/
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Don't throw — let the app render and AuthGate show a clear "not configured" message
  // instead of a blank white screen, which is a much worse first-run experience.
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set. " +
    "Copy .env.example to .env and fill in your Supabase project's values."
  );
}

export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder");
export const isSupabaseConfigured = Boolean(url && anonKey);

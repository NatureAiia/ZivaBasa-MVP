/*
  Onboarding checklist (growth mechanic 1) — Postgres-backed (onboarding_progress table, see
  backend/supabase/migration_add_engagement.sql), client-writable via RLS same as every other
  "own rows only" table (no server trust needed for "did I click through my own checklist").

  Same shape convention as profileStore.js: one row per user, upserted in place.
*/
import { supabase } from "./supabaseClient";

export const ONBOARDING_STEPS = [
  { key: "connected_data_source", label: "Connect your org data" },
  { key: "ran_first_prediction", label: "Run your first prediction" },
  { key: "opened_first_shap", label: "See why, with a SHAP explanation" },
  { key: "invited_teammate", label: "Invite a teammate" },
  { key: "exported_first_report", label: "Export your first report" },
];

export async function getOnboardingProgress() {
  const { data, error } = await supabase.from("onboarding_progress").select("*").maybeSingle();
  if (error) {
    console.error("getOnboardingProgress failed:", error.message);
    return null;
  }
  return data;
}

// Idempotent: marking an already-true step again is a harmless no-op upsert. Returns the
// updated row (or null on failure) so callers can update local state without a re-fetch.
export async function markOnboardingStep(stepKey) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const existing = await getOnboardingProgress();
  if (existing?.[stepKey]) return existing; // already done, avoid an unnecessary write + completion re-check

  const next = { ...(existing || {}), user_id: user.id, [stepKey]: true };
  const allDone = ONBOARDING_STEPS.every((s) => next[s.key]);
  if (allDone && !existing?.completed_at) {
    next.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase.from("onboarding_progress").upsert(next).select().single();
  if (error) {
    console.error("markOnboardingStep failed:", error.message);
    return existing;
  }
  return data;
}

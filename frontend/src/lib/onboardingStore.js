/*
  Onboarding checklist (growth mechanic 1) — backed by Postgres via the backend's /onboarding
  routes (backend/api/routes/onboarding.py) instead of a direct
  `supabase.from("onboarding_progress")` call. Same shape convention as profileStore.js: one row
  per user, upserted in place server-side.
*/
import { request } from "./api";

export const ONBOARDING_STEPS = [
  { key: "connected_data_source", label: "Connect your org data" },
  { key: "ran_first_prediction", label: "Run your first prediction" },
  { key: "opened_first_shap", label: "See why, with a SHAP explanation" },
  { key: "invited_teammate", label: "Invite a teammate" },
  { key: "exported_first_report", label: "Export your first report" },
];

export async function getOnboardingProgress() {
  try {
    return await request("/onboarding");
  } catch (e) {
    console.error("getOnboardingProgress failed:", e.message);
    return null;
  }
}

// Idempotent: marking an already-true step again is a harmless no-op on the backend. Returns
// the updated row (or null on failure) so callers can update local state without a re-fetch.
export async function markOnboardingStep(stepKey) {
  try {
    return await request("/onboarding/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step_key: stepKey }),
    });
  } catch (e) {
    console.error("markOnboardingStep failed:", e.message);
    return await getOnboardingProgress();
  }
}

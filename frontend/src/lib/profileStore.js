/*
  User profile (Postgres `profiles` table) — the signup-time info used to assess a user's
  rights: full name, organization, job title, and requested role. `role` is what the app
  actually gates on and only ever changes via manual admin action (see schema.sql); this
  store never writes it directly.
*/
import { supabase } from "./supabaseClient";

export async function getProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, organization, job_title, requested_role, role")
    .maybeSingle();
  if (error) {
    console.error("getProfile failed:", error.message);
    return null;
  }
  return data;
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

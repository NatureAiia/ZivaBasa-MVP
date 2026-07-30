/*
  Milestone moments (growth mechanic 4) — Postgres-backed (milestone_events table, see
  backend/supabase/migration_add_engagement.sql). Each milestone fires its celebratory toast
  once per user, ever, not on every repeat visit — enforced by a unique(user_id, milestone_key)
  constraint, so a duplicate insert simply fails and is treated as "already fired."
*/
import { supabase } from "./supabaseClient";

export const MILESTONES = {
  FIRST_SKILL_MATCH: "first_skill_match",
  FIRST_REPORT_EXPORT: "first_report_export",
  FIRST_MONTH_ASSIGNMENT_DECIDED: "first_month_assignment_decided",
};

// Toast copy per milestone, shared by every call site so the message stays consistent
// regardless of which screen the milestone fires from.
export const MILESTONE_COPY = {
  [MILESTONES.FIRST_SKILL_MATCH]: {
    title: "First skill match found",
    body: "You've matched your first role to a redeployment target — Roster keeps track of every candidate from here.",
  },
  [MILESTONES.FIRST_REPORT_EXPORT]: {
    title: "First report exported",
    body: "That report is ready to share. Export as many as your plan includes, any time a decision needs paper trail.",
  },
  [MILESTONES.FIRST_MONTH_ASSIGNMENT_DECIDED]: {
    title: "A month of decisions acted on",
    body: "At least one redeployment recommendation was approved or rejected this month — ZivaBasa is now part of a real workflow, not just a dashboard.",
  },
};

// Returns true the first time this milestone fires for the signed-in user (caller should show
// a toast), false if it already fired before or the insert failed for any other reason.
export async function checkAndFireMilestone(milestoneKey) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from("milestone_events")
    .insert({ user_id: user.id, milestone_key: milestoneKey });

  // A unique-violation (Postgres code 23505) means it already fired — that's the expected
  // "don't re-celebrate" path, not a real error.
  if (error && error.code !== "23505") {
    console.error("checkAndFireMilestone failed:", error.message);
  }
  return !error;
}

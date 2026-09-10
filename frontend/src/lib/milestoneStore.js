/*
  Milestone moments (growth mechanic 4) — backed by Postgres via the backend's /milestones route
  (backend/api/routes/milestones.py) instead of a direct `supabase.from("milestone_events")`
  insert. Each milestone fires its celebratory toast once per user, ever, not on every repeat
  visit — enforced server-side by a pre-check against the same unique(user_id, milestone_key)
  constraint the table still has.
*/
import { request } from "./api";

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
// a toast), false if it already fired before or the request failed for any other reason.
export async function checkAndFireMilestone(milestoneKey) {
  try {
    const { fired } = await request("/milestones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ milestone_key: milestoneKey }),
    });
    return fired;
  } catch (e) {
    console.error("checkAndFireMilestone failed:", e.message);
    return false;
  }
}

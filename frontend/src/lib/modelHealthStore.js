/*
  Model-health aggregation — reads the same prediction_feedback rows FeedbackControl writes
  (see feedbackStore.js) and rolls them up per task: satisfaction rate (up / (up+down)) and a
  low-quality-runs list (down-rated rows, joined back to their predict_history entry so a
  reviewer can open the run that triggered the flag). RLS decides scope: an admin sees every
  user's feedback (per "admins can view all feedback" policy), everyone else sees only their own.
*/
import { supabase } from "./supabaseClient";

export async function getModelHealth() {
  const { data, error } = await supabase
    .from("prediction_feedback")
    .select("id, predict_history_id, task, rating, category, note, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getModelHealth failed:", error.message);
    return { byTask: {}, lowQuality: [] };
  }

  const byTask = {};
  for (const row of data) {
    const t = (byTask[row.task] ||= { up: 0, down: 0, categories: {} });
    if (row.rating === "up") t.up += 1;
    else {
      t.down += 1;
      if (row.category) t.categories[row.category] = (t.categories[row.category] || 0) + 1;
    }
  }
  for (const t of Object.values(byTask)) {
    const total = t.up + t.down;
    t.total = total;
    t.satisfactionRate = total > 0 ? t.up / total : null;
  }

  const lowQuality = data.filter((r) => r.rating === "down");

  return { byTask, lowQuality };
}

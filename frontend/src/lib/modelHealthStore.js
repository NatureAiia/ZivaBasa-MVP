/*
  Model-health aggregation — reads the same prediction_feedback rows FeedbackControl writes (see
  feedbackStore.js) via the backend's GET /prediction-feedback route
  (backend/api/routes/feedback.py), and rolls them up per task: satisfaction rate
  (up / (up+down)) and a low-quality-runs list (down-rated rows, joined back to their
  predict_history entry so a reviewer can open the run that triggered the flag). The backend
  decides scope now instead of RLS: an admin/superadmin caller gets every user's feedback,
  everyone else gets only their own — see feedback.py's list_feedback().
*/
import { request } from "./api";

export async function getModelHealth() {
  let data;
  try {
    data = await request("/prediction-feedback");
  } catch (e) {
    console.error("getModelHealth failed:", e.message);
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

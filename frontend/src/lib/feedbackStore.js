/*
  Quality-flagging loop — thumbs up/down + category on a predict_history run, backed by
  Postgres via the backend's /prediction-feedback routes (backend/api/routes/feedback.py)
  instead of a direct `supabase.from("prediction_feedback")` call. One row per user per run:
  re-flagging upserts server-side instead of piling up duplicates.
*/
import { request } from "./api";

export async function getFeedback(predictHistoryId) {
  if (!predictHistoryId) return null;
  try {
    return await request(`/prediction-feedback/${predictHistoryId}`);
  } catch (e) {
    console.error("getFeedback failed:", e.message);
    return null;
  }
}

export async function submitFeedback({ predictHistoryId, task, rating, category, note }) {
  await request("/prediction-feedback", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      predict_history_id: predictHistoryId,
      task,
      rating,
      category: category || null,
      note: note || null,
    }),
  });
}

/*
  Quality-flagging loop — thumbs up/down + category on a predict_history run (prediction_feedback
  table). One row per user per run: re-flagging upserts on the (user_id, predict_history_id)
  unique constraint instead of piling up duplicates.
*/
import { supabase } from "./supabaseClient";

export async function getFeedback(predictHistoryId) {
  if (!predictHistoryId) return null;
  const { data, error } = await supabase
    .from("prediction_feedback")
    .select("rating, category, note")
    .eq("predict_history_id", predictHistoryId)
    .maybeSingle();
  if (error) {
    console.error("getFeedback failed:", error.message);
    return null;
  }
  return data;
}

export async function submitFeedback({ predictHistoryId, task, rating, category, note }) {
  const { error } = await supabase
    .from("prediction_feedback")
    .upsert(
      { predict_history_id: predictHistoryId, task, rating, category: category || null, note: note || null },
      { onConflict: "user_id,predict_history_id" }
    );
  if (error) throw error;
}

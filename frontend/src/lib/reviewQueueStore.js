/*
  Review-queue store — HITL pause/resume for low-confidence predictions (review_queue table).
  Mirrors assignmentStore.js's shape (recommend -> approve/reject, now also "overridden") but as
  a generic queue keyed by task/source rather than assignments' redeployment-specific columns.
*/
import { supabase } from "./supabaseClient";

function fromRow(row) {
  return {
    id: row.id,
    task: row.task,
    source: row.source,
    subject: row.subject,
    predictedValue: row.predicted_value,
    confidenceScore: row.confidence_score,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export async function getReviewQueue() {
  const { data, error } = await supabase
    .from("review_queue")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getReviewQueue failed:", error.message);
    return [];
  }
  return data.map(fromRow);
}

export async function createReviewItem(record) {
  const { error } = await supabase.from("review_queue").insert({
    task: record.task,
    source: record.source,
    subject: record.subject ?? null,
    predicted_value: record.predictedValue,
    confidence_score: record.confidenceScore ?? null,
  });
  if (error) console.error("createReviewItem failed:", error.message);
}

export async function decideReviewItem(id, status, note = "") {
  const { error } = await supabase
    .from("review_queue")
    .update({ status, note, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  return getReviewQueue();
}

/*
  Review-queue store — HITL pause/resume for low-confidence predictions, backed by Postgres via
  the backend's /review-queue routes (backend/api/routes/review_queue.py) instead of a direct
  `supabase.from("review_queue")` call. Mirrors assignmentStore.js's shape (recommend ->
  approve/reject, now also "overridden") but as a generic queue keyed by task/source rather than
  assignments' redeployment-specific columns. Same admin-sees-all/viewer-sees-own split as
  feedbackStore.js/modelHealthStore.js — decided server-side now instead of by RLS.
*/
import { request } from "./api";

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
  try {
    const rows = await request("/review-queue");
    return rows.map(fromRow);
  } catch (e) {
    console.error("getReviewQueue failed:", e.message);
    return [];
  }
}

export async function createReviewItem(record) {
  try {
    await request("/review-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: record.task,
        source: record.source,
        subject: record.subject ?? null,
        predicted_value: record.predictedValue,
        confidence_score: record.confidenceScore ?? null,
      }),
    });
  } catch (e) {
    console.error("createReviewItem failed:", e.message);
  }
}

export async function decideReviewItem(id, status, note = "") {
  const rows = await request(`/review-queue/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  });
  return rows.map(fromRow);
}

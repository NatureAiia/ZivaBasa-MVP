/*
  Confirmed cross-dataset "golden record" links — backed by Postgres via the backend's
  /entity-links routes (backend/api/routes/entity_links.py) instead of a direct
  `supabase.from("entity_links")` call. See backend/src/entity_resolution.py for the matching
  logic; this store only persists decisions, same stateless-API/stateful-frontend split as
  every other *Store.js file.
*/
import { request } from "./api";

export async function getEntityLinks() {
  try {
    return await request("/entity-links");
  } catch (e) {
    console.error("getEntityLinks failed:", e.message);
    return [];
  }
}

// Confirms one cluster: every member gets the same golden_id, upserted on (task, row_label) so
// re-confirming just updates the existing link rather than duplicating it.
export async function confirmCluster(members, goldenId) {
  await request("/entity-links", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      golden_id: goldenId,
      members: members.map((m) => ({ task: m.task, row_label: m.label, match_score: m.match_score })),
    }),
  });
}

export async function removeLink(task, rowLabel) {
  await request(`/entity-links?task=${encodeURIComponent(task)}&row_label=${encodeURIComponent(rowLabel)}`, {
    method: "DELETE",
  });
}

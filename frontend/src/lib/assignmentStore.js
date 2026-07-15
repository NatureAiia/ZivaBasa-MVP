/*
  Assignment store — the approval-workflow audit trail borrowed from FFIMS SWS's
  duty-assignment concept (checked against the real FFIMS v3.6 codebase: driver + date range +
  assignedBy + purpose + status, a genuine history of who was assigned where and why). This is
  the piece ZivaBasa's Roster page didn't have before: a redeployment recommendation isn't just
  shown and forgotten, it becomes a record someone approved or rejected, kept even after the
  underlying prediction data changes.

  A record: { id, roleId, roleTitle, fromRole, toRole, cosineSimilarityScore, missingSkills,
              status: "pending" | "approved" | "rejected", decidedAt, note, recommendedAt }
*/
const KEY = "zivabasa-org-assignments";

export function getAssignments() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(records) {
  localStorage.setItem(KEY, JSON.stringify(records));
  return records;
}

export function recommendAssignment(record) {
  const records = getAssignments();
  // Don't duplicate an existing pending/decided recommendation for the same role -> target
  // pair — re-running the analysis on an unchanged org chart shouldn't spam new rows.
  const existing = records.find((r) => r.roleId === record.roleId && r.toRole === record.toRole);
  if (existing) return records;
  const next = [
    { ...record, id: `asg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, status: "pending", recommendedAt: new Date().toISOString() },
    ...records,
  ];
  return write(next);
}

export function decideAssignment(id, status, note = "") {
  const records = getAssignments().map((r) =>
    r.id === id ? { ...r, status, note, decidedAt: new Date().toISOString() } : r
  );
  return write(records);
}

export function clearAssignments() {
  write([]);
}

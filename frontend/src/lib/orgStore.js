/*
  Org structure store — persisted (localStorage, same pattern as the rest of this app). A node
  is one role in the organization: who it reports to, what skills the person in it has today,
  and (optionally) what future role/skills it's expected to move toward. This is the input to
  both the org chart render and the job-relevance / skill-match analysis in My Organization.
*/
const KEY = "zivabasa-org-structure";

// node: { id, title, department, parentId (null = top of chart), currentSkills: [],
//         targetRole: "" | string, targetSkills: [], seniorityYears, headcount }
export function getOrgNodes() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(nodes) {
  localStorage.setItem(KEY, JSON.stringify(nodes));
  return nodes;
}

export function upsertNode(node) {
  const nodes = getOrgNodes();
  const id = node.id || `role-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const idx = nodes.findIndex((n) => n.id === id);
  const next = { ...node, id };
  if (idx >= 0) nodes[idx] = next;
  else nodes.push(next);
  return write(nodes);
}

export function removeNode(id) {
  // Re-parent any children of the removed node to its own parent, rather than orphaning a
  // whole subtree — matches how removing a manager in a real org chart should behave.
  const nodes = getOrgNodes();
  const removed = nodes.find((n) => n.id === id);
  const next = nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.parentId === id ? { ...n, parentId: removed?.parentId ?? null } : n));
  return write(next);
}

export function clearOrgNodes() {
  write([]);
}

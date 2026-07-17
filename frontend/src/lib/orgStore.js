/*
  Org structure store — now backed by Postgres (org_nodes table, see
  backend/supabase/schema.sql) instead of localStorage, so a reporting structure built in
  My Organization survives across devices/browsers and isn't lost if the browser's storage
  is cleared. Same exported function names/shapes as the old localStorage version — call
  sites just need `await`.

  node: { id, title, department, parentId (null = top of chart), currentSkills: [],
          targetRole: "" | string, targetSkills: [], seniorityYears, headcount }
*/
import { supabase } from "./supabaseClient";

function fromRow(row) {
  return {
    id: row.id,
    title: row.title,
    department: row.department,
    parentId: row.parent_id,
    currentSkills: row.current_skills || [],
    targetRole: row.target_role,
    targetSkills: row.target_skills || [],
    seniorityYears: row.seniority_years,
    headcount: row.headcount,
  };
}

function toRow(node) {
  return {
    ...(node.id ? { id: node.id } : {}),
    title: node.title,
    department: node.department,
    parent_id: node.parentId ?? null,
    current_skills: node.currentSkills || [],
    target_role: node.targetRole || null,
    target_skills: node.targetSkills || [],
    seniority_years: node.seniorityYears ?? null,
    headcount: node.headcount ?? 1,
  };
}

export async function getOrgNodes() {
  const { data, error } = await supabase.from("org_nodes").select("*").order("created_at");
  if (error) {
    console.error("getOrgNodes failed:", error.message);
    return [];
  }
  return data.map(fromRow);
}

export async function upsertNode(node) {
  const { data, error } = await supabase
    .from("org_nodes")
    .upsert(toRow(node))
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function removeNode(id) {
  // Re-parent any children of the removed node to its own parent first, rather than
  // orphaning a whole subtree — matches how removing a manager in a real org chart should
  // behave. Two round-trips (fetch parent, then re-parent + delete) since Postgres can't
  // read-then-write a self-referencing FK in one statement here.
  const { data: removed } = await supabase.from("org_nodes").select("parent_id").eq("id", id).single();
  await supabase.from("org_nodes").update({ parent_id: removed?.parent_id ?? null }).eq("parent_id", id);
  const { error } = await supabase.from("org_nodes").delete().eq("id", id);
  if (error) throw error;
}

export async function clearOrgNodes() {
  const { error } = await supabase.from("org_nodes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}

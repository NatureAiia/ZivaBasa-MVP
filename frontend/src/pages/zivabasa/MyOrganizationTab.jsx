import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Sparkles, CheckCircle2, XCircle, Clock, ArrowRight, Network } from "lucide-react";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import EmptyState from "../../components/common/EmptyState";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getOrgNodes, upsertNode, removeNode } from "../../lib/orgStore";
import { getAssignments, recommendAssignment, decideAssignment } from "../../lib/assignmentStore";
import { matchScore, SKILL_LABELS } from "../../lib/skillMatchClient";
import OrgChart from "../../components/organization/OrgChart";
import RoleEditor from "../../components/organization/RoleEditor";

function productivityNarrative(overlapCount, missingCount) {
  const total = overlapCount + missingCount;
  const pct = total > 0 ? overlapCount / total : 0;
  if (total === 0) return "Add skills to both the current and target role to estimate transition impact.";
  if (pct >= 0.7) {
    return `High skill overlap (${overlapCount}/${total}) — this transition is likely to preserve most current productivity, with a short ramp-up on the remaining ${missingCount} skill${missingCount === 1 ? "" : "s"}.`;
  }
  if (pct >= 0.4) {
    return `Moderate skill overlap (${overlapCount}/${total}) — expect a temporary productivity dip while upskilling on the ${missingCount} missing skill${missingCount === 1 ? "" : "s"}.`;
  }
  return `Low skill overlap (${overlapCount}/${total}) — this is a significant retraining investment, not a quick transition. Budget real training time before counting on it.`;
}

export default function MyOrganizationTab() {
  const [nodes, setNodes] = useState(getOrgNodes);
  const [assignments, setAssignments] = useState(getAssignments);
  const [editingId, setEditingId] = useState(null); // null = not editing, "new" = adding, else node id
  const [selectedId, setSelectedId] = useState(null);

  const selected = nodes.find((n) => n.id === selectedId);
  const editingNode = editingId && editingId !== "new" ? nodes.find((n) => n.id === editingId) : null;

  const pendingAssignments = useMemo(() => assignments.filter((a) => a.status === "pending"), [assignments]);
  const decidedAssignments = useMemo(() => assignments.filter((a) => a.status !== "pending"), [assignments]);

  const saveNode = (node) => {
    setNodes(upsertNode(node));
    setEditingId(null);
  };
  const deleteNode = (id) => {
    setNodes(removeNode(id));
    if (selectedId === id) setSelectedId(null);
  };

  const gap = selected?.targetRole ? matchScore(selected.currentSkills, selected.targetSkills) : null;

  const recommend = () => {
    if (!selected || !gap) return;
    setAssignments(
      recommendAssignment({
        roleId: selected.id,
        roleTitle: selected.title,
        fromRole: selected.title,
        toRole: selected.targetRole,
        cosineSimilarityScore: gap.cosineSimilarityScore,
        missingSkills: gap.missingSkills,
      })
    );
  };

  const decide = (id, status) => setAssignments(decideAssignment(id, status));

  return (
    <div className="flex-1 overflow-y-auto">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="p-6 max-w-5xl mx-auto w-full flex flex-col gap-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink flex items-center gap-2">
              <Network size={20} className="text-gold" /> My Organization
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              Build your reporting structure, see where roles are headed, and turn a skill match into a tracked decision.
            </p>
          </div>
          {editingId === null && (
            <button
              onClick={() => setEditingId("new")}
              className="flex items-center gap-1.5 bg-gold text-bg rounded-xl px-3.5 py-2 text-xs font-semibold hover:brightness-110"
            >
              <Plus size={14} /> Add a role
            </button>
          )}
        </div>

        {editingId !== null && (
          <motion.div variants={fadeUpItem}>
            <RoleEditor
              node={editingNode}
              otherNodes={nodes.filter((n) => n.id !== editingId)}
              onSave={saveNode}
              onCancel={() => setEditingId(null)}
            />
          </motion.div>
        )}

        {nodes.length === 0 ? (
          <EmptyState
            icon={Network}
            title="No organization structure yet"
            description='Click "Add a role" to start building your reporting structure — even 2-3 roles is enough to see how this works.'
          />
        ) : (
          <motion.div variants={fadeUpItem}>
            <Card animated={false} className="overflow-x-auto">
              <OrgChart nodes={nodes} onSelect={setSelectedId} selectedId={selectedId} />
            </Card>
          </motion.div>
        )}

        {selected && (
          <motion.div variants={fadeUpItem}>
            <Card animated={false} className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-ink">{selected.title}</h2>
                  <p className="text-xs text-ink-faint">{selected.department} · {selected.headcount} in role</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(selected.id)} className="text-xs text-ink-muted hover:text-ink">Edit</button>
                  <button onClick={() => deleteNode(selected.id)} className="text-ink-faint hover:text-red"><Trash2 size={14} /></button>
                </div>
              </div>

              {selected.targetRole ? (
                <div className="flex flex-col gap-3 border-t border-border pt-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-ink-muted">{selected.title}</span>
                    <ArrowRight size={12} className="text-ink-faint" />
                    <span className="text-teal font-medium">{selected.targetRole}</span>
                    {gap && (
                      <Badge tone={gap.cosineSimilarityScore >= 0.6 ? "teal" : "gold"}>
                        {(gap.cosineSimilarityScore * 100).toFixed(0)}% skill match
                      </Badge>
                    )}
                  </div>

                  {gap && gap.matchedSkills.length > 0 && (
                    <div>
                      <span className="text-[11px] text-ink-faint block mb-1">Already has</span>
                      <div className="flex flex-wrap gap-1.5">
                        {gap.matchedSkills.map((s) => <Badge key={s} tone="teal">{SKILL_LABELS[s]}</Badge>)}
                      </div>
                    </div>
                  )}
                  {gap && gap.missingSkills.length > 0 && (
                    <div>
                      <span className="text-[11px] text-ink-faint block mb-1">Training needed</span>
                      <div className="flex flex-wrap gap-1.5">
                        {gap.missingSkills.map((s) => <Badge key={s} tone="gold">{SKILL_LABELS[s]}</Badge>)}
                      </div>
                    </div>
                  )}

                  {gap && (
                    <p className="text-[11px] text-ink-faint leading-relaxed bg-surface2/60 rounded-lg p-2.5">
                      {productivityNarrative(gap.skillOverlapCount, gap.missingSkillCount)}{" "}
                      This is a quick skill-overlap estimate, not a model prediction — for a full
                      SHAP-explained prediction with real staff data, use{" "}
                      <Link to="predict" className="text-gold hover:underline">Predict → Job and Skill Matching</Link>.
                    </p>
                  )}

                  <button
                    onClick={recommend}
                    disabled={!gap || pendingAssignments.some((a) => a.roleId === selected.id && a.toRole === selected.targetRole) || decidedAssignments.some((a) => a.roleId === selected.id && a.toRole === selected.targetRole)}
                    className="flex items-center gap-1.5 text-xs font-medium bg-gold/10 border border-gold/30 text-gold rounded-lg px-3 py-2 hover:bg-gold/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-fit"
                  >
                    <Sparkles size={13} /> Recommend this redeployment
                  </button>
                </div>
              ) : (
                <p className="text-xs text-ink-faint border-t border-border pt-3">
                  No future role set for this position — edit the role to add one and see a skill-gap analysis here.
                </p>
              )}
            </Card>
          </motion.div>
        )}

        {(pendingAssignments.length > 0 || decidedAssignments.length > 0) && (
          <motion.div variants={fadeUpItem}>
            <Card animated={false} className="flex flex-col gap-3">
              <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
                Redeployment decisions
              </h2>
              <AnimatePresence initial={false}>
                {pendingAssignments.map((a) => (
                  <motion.div
                    key={a.id}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 bg-surface2/50 rounded-xl px-3 py-2.5 text-xs"
                  >
                    <Clock size={13} className="text-gold shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-ink">
                      {a.fromRole} <ArrowRight size={10} className="inline mx-1 text-ink-faint" /> {a.toRole}
                    </span>
                    <Badge tone="gold">{(a.cosineSimilarityScore * 100).toFixed(0)}% match</Badge>
                    <button onClick={() => decide(a.id, "approved")} className="text-teal hover:brightness-110" aria-label="Approve">
                      <CheckCircle2 size={16} />
                    </button>
                    <button onClick={() => decide(a.id, "rejected")} className="text-red hover:brightness-110" aria-label="Reject">
                      <XCircle size={16} />
                    </button>
                  </motion.div>
                ))}
                {decidedAssignments.map((a) => (
                  <motion.div key={a.id} className="flex items-center gap-3 px-3 py-1.5 text-xs opacity-60">
                    {a.status === "approved" ? (
                      <CheckCircle2 size={13} className="text-teal shrink-0" />
                    ) : (
                      <XCircle size={13} className="text-red shrink-0" />
                    )}
                    <span className="flex-1 min-w-0 truncate text-ink-muted">
                      {a.fromRole} → {a.toRole}
                    </span>
                    <span className="text-[10px] text-ink-faint capitalize">{a.status}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {decidedAssignments.some((a) => a.status === "approved") && (
                <Link to="roster" className="text-[11px] text-gold hover:brightness-110 self-start">
                  View approved candidates in Roster →
                </Link>
              )}
            </Card>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

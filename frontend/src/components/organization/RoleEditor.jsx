import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ALL_SKILLS, SKILL_LABELS } from "../../lib/skillMatchClient";

const EMPTY = {
  title: "", department: "", parentId: "", currentSkills: [], targetRole: "",
  targetSkills: [], seniorityYears: "", headcount: 1,
  avgSalaryUsd: "", performanceRating: "", recentTrainingHours: "", recentOtHours: "",
};

function SkillPicker({ label, selected, onChange }) {
  const toggle = (skill) => {
    onChange(selected.includes(skill) ? selected.filter((s) => s !== skill) : [...selected, skill]);
  };
  return (
    <div>
      <span className="text-[11px] text-ink-faint block mb-1.5">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {ALL_SKILLS.map((skill) => (
          <button
            key={skill}
            type="button"
            onClick={() => toggle(skill)}
            className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
              selected.includes(skill)
                ? "bg-gold/10 border-gold/30 text-gold"
                : "border-border text-ink-faint hover:text-ink"
            }`}
          >
            {SKILL_LABELS[skill]}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function RoleEditor({ node, otherNodes, onSave, onCancel }) {
  const [form, setForm] = useState(node || EMPTY);

  useEffect(() => setForm(node || EMPTY), [node]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  // Optional business fields (see orgStore.js) — an empty input means "not entered", not zero,
  // since Chiedza's scan_org_risk tool treats a missing value as "skip this role", not "0".
  const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({
      ...form,
      parentId: form.parentId || null,
      seniorityYears: Number(form.seniorityYears) || 0,
      headcount: Number(form.headcount) || 1,
      avgSalaryUsd: numOrNull(form.avgSalaryUsd),
      performanceRating: numOrNull(form.performanceRating),
      recentTrainingHours: numOrNull(form.recentTrainingHours),
      recentOtHours: numOrNull(form.recentOtHours),
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 bg-surface2/50 rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-ink">{node ? "Edit role" : "Add a role"}</h3>
        <button type="button" onClick={onCancel} className="text-ink-faint hover:text-ink"><X size={14} /></button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-faint">Job title</span>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Branch Officer"
            className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-gold/50" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-faint">Department</span>
          <input value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Retail Banking"
            className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-gold/50" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-faint">Reports to</span>
          <select value={form.parentId || ""} onChange={(e) => set("parentId", e.target.value)}
            className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-gold/50">
            <option value="">— Top of chart —</option>
            {otherNodes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-faint">Headcount in this role</span>
          <input type="number" min="1" value={form.headcount} onChange={(e) => set("headcount", e.target.value)}
            className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-gold/50" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-faint">Avg. seniority (years)</span>
          <input type="number" min="0" step="0.5" value={form.seniorityYears} onChange={(e) => set("seniorityYears", e.target.value)}
            className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-gold/50" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-faint">Future role target (optional)</span>
          <input value={form.targetRole} onChange={(e) => set("targetRole", e.target.value)} placeholder="e.g. Digital Banking Officer"
            className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-gold/50" />
        </label>
      </div>

      <SkillPicker label="Current skills" selected={form.currentSkills} onChange={(v) => set("currentSkills", v)} />
      {form.targetRole && (
        <>
          <SkillPicker label={`Skills needed for "${form.targetRole}"`} selected={form.targetSkills} onChange={(v) => set("targetSkills", v)} />
          <div>
            <span className="text-[11px] text-ink-faint block mb-1.5">
              Optional — enables Chiedza's org-wide redeployment-fit scan for this role (leave blank to skip it)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-ink-faint">Avg. salary (USD)</span>
                <input type="number" min="0" value={form.avgSalaryUsd} onChange={(e) => set("avgSalaryUsd", e.target.value)}
                  className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-gold/50" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-ink-faint">Performance rating (1-5)</span>
                <input type="number" min="1" max="5" step="0.5" value={form.performanceRating} onChange={(e) => set("performanceRating", e.target.value)}
                  className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-gold/50" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-ink-faint">Recent training hours</span>
                <input type="number" min="0" value={form.recentTrainingHours} onChange={(e) => set("recentTrainingHours", e.target.value)}
                  className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-gold/50" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-ink-faint">Recent overtime hours</span>
                <input type="number" min="0" value={form.recentOtHours} onChange={(e) => set("recentOtHours", e.target.value)}
                  className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-gold/50" />
              </label>
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="text-xs text-ink-faint hover:text-ink px-3 py-1.5">Cancel</button>
        <button type="submit" className="text-xs font-medium bg-gold text-bg rounded-lg px-3.5 py-1.5 hover:brightness-110">
          {node ? "Save changes" : "Add role"}
        </button>
      </div>
    </form>
  );
}

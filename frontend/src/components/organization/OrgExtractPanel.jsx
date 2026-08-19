import { useState } from "react";
import { Sparkles, Loader2, Check, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";
import { upsertNode } from "../../lib/orgStore";

/*
  Org chart vision auto-extraction — the natural next step for OrgStructureUpload's reference
  file now that the backend has vision-capable providers wired up (Claude, Gemini; see
  backend/api/org_extract.py for why NVIDIA/Groq aren't included yet). Takes the attached
  image/PDF, asks a vision model to read it into a flat role list with a `reports_to` title
  string per role, shows the person a checklist to review before anything is created, then
  imports the accepted roles as real org_nodes with hierarchy resolved by title match.
*/

// Two passes: create every accepted role first (parentless), then a second pass to attach
// parentId now that every role in this batch has a real id to point at — reports_to is a
// title string from the vision model, not an id, so it can't be resolved until pass one exists.
async function importRoles(roles) {
  const idByTitle = {};
  for (const r of roles) {
    const created = await upsertNode({
      title: r.title,
      department: r.department || "",
      currentSkills: [],
      targetSkills: [],
      headcount: r.headcount || 1,
    });
    idByTitle[r.title] = created.id;
  }
  for (const r of roles) {
    if (!r.reports_to || !idByTitle[r.reports_to]) continue;
    await upsertNode({ id: idByTitle[r.title], title: r.title, department: r.department || "", parentId: idByTitle[r.reports_to] });
  }
  return roles.length;
}

export default function OrgExtractPanel({ file, onImported }) {
  const [state, setState] = useState("idle"); // idle | extracting | review | importing | done | error
  const [roles, setRoles] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [included, setIncluded] = useState({}); // title -> bool
  const [provider, setProvider] = useState(null);
  const [error, setError] = useState(null);

  const extract = async () => {
    setState("extracting");
    setError(null);
    try {
      const result = await api.extractOrgChart(file);
      setRoles(result.roles);
      setWarnings(result.warnings || []);
      setProvider(result.provider);
      setIncluded(Object.fromEntries(result.roles.map((r) => [r.title, true])));
      setState(result.roles.length ? "review" : "error");
      if (!result.roles.length) setError("Couldn't confidently read any roles from this file.");
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  };

  const toggle = (title) => setIncluded((c) => ({ ...c, [title]: !c[title] }));

  const doImport = async () => {
    setState("importing");
    try {
      const accepted = roles.filter((r) => included[r.title]);
      const count = await importRoles(accepted);
      setState("done");
      onImported?.(count);
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  };

  if (state === "idle") {
    return (
      <button
        onClick={extract}
        className="flex items-center gap-1.5 text-[11px] font-medium text-gold hover:brightness-110 self-start"
      >
        <Sparkles size={12} /> Extract roles from this file
      </button>
    );
  }

  if (state === "extracting") {
    return (
      <p className="text-[11px] text-ink-faint flex items-center gap-1.5">
        <Loader2 size={12} className="animate-spin" /> Reading the org chart…
      </p>
    );
  }

  if (state === "error") {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-red flex items-center gap-1.5">
          <AlertTriangle size={12} /> {error}
        </p>
        <button onClick={extract} className="text-[11px] text-gold hover:brightness-110 self-start">
          Try again
        </button>
      </div>
    );
  }

  if (state === "done") {
    return (
      <p className="text-[11px] text-teal flex items-center gap-1.5">
        <Check size={12} /> Imported into your reporting structure below.
      </p>
    );
  }

  // review | importing
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gold/25 bg-gold/[0.04] p-3">
      <p className="text-[11px] text-ink-faint">
        Read by {provider === "anthropic" ? "Claude" : "Gemini"} — review before importing,
        nothing's created yet.
      </p>
      {warnings.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {warnings.map((w, i) => (
            <p key={i} className="text-[10px] text-gold flex items-start gap-1">
              <AlertTriangle size={10} className="shrink-0 mt-0.5" /> {w}
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
        {roles.map((r) => (
          <label key={r.title} className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={!!included[r.title]} onChange={() => toggle(r.title)} className="accent-gold" />
            <span className="text-ink">{r.title}</span>
            {r.department && <span className="text-ink-faint">· {r.department}</span>}
            {r.reports_to && <span className="text-ink-faint">→ reports to {r.reports_to}</span>}
          </label>
        ))}
      </div>
      <button
        onClick={doImport}
        disabled={state === "importing" || !Object.values(included).some(Boolean)}
        className="flex items-center justify-center gap-1.5 bg-gold text-bg rounded-lg px-3 py-1.5 text-xs font-semibold hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none mt-1"
      >
        {state === "importing" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        {state === "importing" ? "Importing…" : `Import ${Object.values(included).filter(Boolean).length} role(s)`}
      </button>
    </div>
  );
}

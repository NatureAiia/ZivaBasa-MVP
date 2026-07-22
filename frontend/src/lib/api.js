/*
  API client for the ZivaBasa FastAPI backend (api/main.py + model_registry.py, already fixed
  for the scaler/leakage-column bug). Same contract v1's dashboard used: GET /health,
  GET /schema/{task}, POST /predict/{task}, POST /explain/{task}.
*/

const DEFAULT_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function getBase() {
  return localStorage.getItem("zivabasa-api-base") || DEFAULT_BASE;
}

export function setApiBase(url) {
  localStorage.setItem("zivabasa-api-base", url.replace(/\/$/, ""));
}

async function request(path, options) {
  const base = getBase();
  let res;
  try {
    res = await fetch(base + path, options);
  } catch (e) {
    throw new Error(`Could not reach API at ${base}. Is uvicorn running? (${e.message})`);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch (_) {
      /* non-JSON error body, keep statusText */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

async function requestBlob(path, options) {
  const base = getBase();
  let res;
  try {
    res = await fetch(base + path, options);
  } catch (e) {
    throw new Error(`Could not reach API at ${base}. Is uvicorn running? (${e.message})`);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* non-JSON error body, keep statusText */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.blob();
}

export const api = {
  base: getBase,
  health: () => request("/health"),
  schema: (task) => request(`/schema/${task}`),
  predict: (task, features) =>
    request(`/predict/${task}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
    }),
  explain: (task, features, topK = 8) =>
    request(`/explain/${task}?top_k=${topK}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
    }),
  predictBatch: async (task, file) => {
    const form = new FormData();
    form.append("file", file);
    const base = getBase();
    let res;
    try {
      res = await fetch(`${base}/predict/batch/${task}`, { method: "POST", body: form });
    } catch (e) {
      throw new Error(`Could not reach API at ${base}. Is uvicorn running? (${e.message})`);
    }
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail || JSON.stringify(body);
      } catch (_) {}
      throw new Error(`${res.status}: ${detail}`);
    }
    return res.json();
  },
  chat: (messages, provider = null) =>
    request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, provider }),
    }),
  // Chiedza's LangGraph agent mode (backend/api/agent_graph.py) — a parallel capability
  // alongside chat() above, not a replacement. userId scopes its Supabase context tools
  // (org chart / predict history / batch results) to the signed-in user.
  chatAgent: (messages, userId = null) =>
    request("/chat/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, user_id: userId }),
    }),
  chatModels: () => request("/chat/models"),
  orgExtractProviders: () => request("/organization/extract/providers"),
  extractOrgChart: async (file, provider = null) => {
    const form = new FormData();
    form.append("file", file);
    const base = getBase();
    const qs = provider ? `?provider=${encodeURIComponent(provider)}` : "";
    let res;
    try {
      res = await fetch(`${base}/organization/extract${qs}`, { method: "POST", body: form });
    } catch (e) {
      throw new Error(`Could not reach API at ${base}. Is uvicorn running? (${e.message})`);
    }
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail || JSON.stringify(body);
      } catch (_) {}
      throw new Error(`${res.status}: ${detail}`);
    }
    return res.json();
  },
  imageProviders: () => request("/images/providers"),
  generateImage: (prompt) =>
    request("/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    }),
  predictReport: (results, extraNotes = null) =>
    requestBlob("/reports/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results, extra_notes: extraNotes }),
    }),
  chatReport: (messages, toolCalls = []) =>
    requestBlob("/reports/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, tool_calls: toolCalls }),
    }),
  predictReportPdf: (results, extraNotes = null) =>
    requestBlob("/reports/predict/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results, extra_notes: extraNotes }),
    }),
  predictReportXlsx: (results, extraNotes = null) =>
    requestBlob("/reports/predict/xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results, extra_notes: extraNotes }),
    }),
  chatReportPdf: (messages, toolCalls = []) =>
    requestBlob("/reports/chat/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, tool_calls: toolCalls }),
    }),
  forecastSchema: () => request("/schema/forecast"),
  forecast: (industry, years = 0) =>
    request(`/predict/forecast/${encodeURIComponent(industry)}?years=${years}`),
  uplift: (task, features) =>
    request(`/uplift/${task}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
    }),
  federatedSimulate: (task = "skills", numInstitutions = 3, numRounds = 5) =>
    request("/federated/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, num_institutions: numInstitutions, num_rounds: numRounds }),
    }),
};

export const TASKS = ["employment", "skills", "productivity", "skill_match", "human_capital"];
export const TASK_LABELS = {
  employment: "Job & Automation Risk",
  skills: "Employee Turnover Risk",
  productivity: "AI Impact on Productivity",
  skill_match: "Job and Skill Matching",
  human_capital: "Human Capital Turnover (Real HR Data)",
};
// Short form for compact UI (tabs, pills, badges) — TASK_LABELS above is full-length for
// headers/descriptions. Previously both jobs were done by one slash-joined string
// ("Employment / Automation Risk") and callers did .split(" / ")[0] to get the short half;
// that broke the moment the label stopped having a slash in it, so it's two real maps now.
export const TASK_SHORT_LABELS = {
  employment: "Automation Risk",
  skills: "Turnover Risk",
  productivity: "AI Productivity",
  skill_match: "Skill Matching",
  human_capital: "HR Turnover",
};
export const TASK_DESCRIPTIONS = {
  employment: "Which roles are most at risk of being automated.",
  skills: "Which employees are most likely to leave, and why.",
  productivity: "How AI adoption is likely to change output per employee.",
  skill_match: "Which staff are a strong fit for a different role, and why.",
  // "Real HR Data" called out explicitly here (not just in TASK_LABELS) because "skills"
  // above already covers turnover-ish territory from a proxy dataset (IBM HR attrition) —
  // this label is what tells a user the two aren't the same signal.
  human_capital: "Which employees are likely to leave, based on real HR roster data (not a proxy dataset).",
};

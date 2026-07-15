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
  chatModels: () => request("/chat/models"),
  predictReport: (results) =>
    requestBlob("/reports/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    }),
  chatReport: (messages, toolCalls = []) =>
    requestBlob("/reports/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, tool_calls: toolCalls }),
    }),
};

export const TASKS = ["employment", "skills", "productivity", "skill_match"];
export const TASK_LABELS = {
  employment: "Job & Automation Risk",
  skills: "Employee Turnover Risk",
  productivity: "AI Impact on Productivity",
  skill_match: "Job and Skill Matching",
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
};
export const TASK_DESCRIPTIONS = {
  employment: "Which roles are most at risk of being automated.",
  skills: "Which employees are most likely to leave, and why.",
  productivity: "How AI adoption is likely to change output per employee.",
  skill_match: "Which staff are a strong fit for a different role, and why.",
};

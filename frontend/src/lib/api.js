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
};

export const TASKS = ["employment", "skills", "productivity"];
export const TASK_LABELS = {
  employment: "Employment / Automation Risk",
  skills: "Skills / Attrition",
  productivity: "Productivity / AI Adoption",
};
export const NEXT_TASK_LABEL = { employment: "Skills", skills: "Productivity" };

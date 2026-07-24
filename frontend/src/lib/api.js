/*
  API client for the ZivaBasa FastAPI backend (api/main.py + model_registry.py, already fixed
  for the scaler/leakage-column bug). Same contract v1's dashboard used: GET /health,
  GET /schema/{task}, POST /predict/{task}, POST /explain/{task}.
*/
import { supabase } from "./supabaseClient";

// Thrown instead of a generic Error whenever the backend's token gate (backend/api/tokens.py)
// returns its structured 402 body — lets call sites catch this specifically and show the
// "what you'd unlock" upgrade prompt instead of a generic error toast.
export class InsufficientTokensError extends Error {
  constructor(detail) {
    super(detail?.upgrade_hint || "Out of tokens.");
    this.name = "InsufficientTokensError";
    this.balance = detail?.balance;
    this.required = detail?.required;
    this.reason = detail?.reason;
    this.upgradeHint = detail?.upgrade_hint;
  }
}

const DEFAULT_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function getBase() {
  return localStorage.getItem("zivabasa-api-base") || DEFAULT_BASE;
}

export function setApiBase(url) {
  localStorage.setItem("zivabasa-api-base", url.replace(/\/$/, ""));
}

// Attach the current Supabase session's access token, if there is one, so the backend's
// optional Supabase-role fallback (api/supabase_auth.py) can resolve who's actually calling. A
// no-op when Supabase isn't configured (getSession() then just resolves to no session) or when
// the backend hasn't turned on that fallback (auth.py ignores the header either way). Shared by
// every call site that hits the backend, including the two raw-fetch multipart uploads below
// that don't go through request() (predictBatch, extractOrgChart) — those need it too, since
// /predict/batch/{task} is exactly where the new redaction feature depends on it.
async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Shared by every call site that turns a non-ok Response into a thrown error (request(),
// requestBlob(), and the raw-fetch multipart uploads below that don't go through either). A
// 402 with the token gate's structured { error: "insufficient_tokens", ... } body becomes an
// InsufficientTokensError so upgrade-prompt UI can catch it specifically; every other error
// stays a plain Error, unchanged from before.
async function throwApiError(res) {
  let detail = res.statusText;
  try {
    const body = await res.json();
    detail = body.detail || JSON.stringify(body);
    if (res.status === 402 && detail && detail.error === "insufficient_tokens") {
      // Fire the global upgrade modal regardless of which call site hit the gate — dynamic
      // import keeps this plain HTTP-client module from taking a hard dependency on a UI
      // component tree. A failure here should never stop the real error from still throwing.
      import("../components/tokens/UpgradeModal")
        .then(({ triggerUpgradeModal }) => triggerUpgradeModal(detail))
        .catch(() => {});
      throw new InsufficientTokensError(detail);
    }
  } catch (e) {
    if (e instanceof InsufficientTokensError) throw e;
    /* non-JSON error body, keep statusText */
  }
  throw new Error(`${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

async function request(path, options) {
  const base = getBase();
  const auth = await authHeaders();
  const withAuth = { ...options, headers: { ...(options?.headers || {}), ...auth } };
  let res;
  try {
    res = await fetch(base + path, withAuth);
  } catch (e) {
    throw new Error(`Could not reach API at ${base}. Is uvicorn running? (${e.message})`);
  }
  if (!res.ok) await throwApiError(res);
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
  if (!res.ok) await throwApiError(res);
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
  explain: (task, features, topK = 8, includeLime = false) =>
    request(`/explain/${task}?top_k=${topK}&include_lime=${includeLime}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
    }),
  predictBatch: async (task, file) => {
    const form = new FormData();
    form.append("file", file);
    const base = getBase();
    const auth = await authHeaders();
    let res;
    try {
      res = await fetch(`${base}/predict/batch/${task}`, { method: "POST", body: form, headers: auth });
    } catch (e) {
      throw new Error(`Could not reach API at ${base}. Is uvicorn running? (${e.message})`);
    }
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  chat: (messages, provider = null, attachment = null) =>
    request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, provider, attachment }),
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
  // Server-Sent-Events variant of chatAgent() above (backend/api/agent_graph.py's
  // stream_agent()) — same request shape, but calls onEvent(frame) as each SSE frame arrives
  // instead of resolving once with the full reply. Frame .type is one of "token" (incremental
  // text — append to the in-progress reply), "tool_start"/"tool_end" (status only), "done"
  // (final frame on success — .tool_calls/.generated_images match chatAgent()'s response
  // shape), or "error" (in place of "done" — streaming responses can't carry an HTTP error
  // status once they've started, so failures surface as this frame instead of a rejected
  // promise). Not built on EventSource: EventSource can't send a POST body or an Authorization
  // header, both of which this call needs.
  chatAgentStream: async (messages, userId, onEvent) => {
    const base = getBase();
    const auth = await authHeaders();
    let res;
    try {
      res = await fetch(`${base}/chat/agent/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ messages, user_id: userId }),
      });
    } catch (e) {
      throw new Error(`Could not reach API at ${base}. Is uvicorn running? (${e.message})`);
    }
    if (!res.ok) await throwApiError(res);
    if (!res.body) {
      throw new Error(`${res.status}: ${res.statusText}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line; each frame's payload is one "data: ..." line.
      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (line) onEvent(JSON.parse(line.slice(6)));
      }
    }
  },
  chatModels: () => request("/chat/models"),
  chatBudget: () => request("/chat/budget"),
  orgExtractProviders: () => request("/organization/extract/providers"),
  extractOrgChart: async (file, provider = null) => {
    const form = new FormData();
    form.append("file", file);
    const base = getBase();
    const qs = provider ? `?provider=${encodeURIComponent(provider)}` : "";
    const auth = await authHeaders();
    let res;
    try {
      res = await fetch(`${base}/organization/extract${qs}`, { method: "POST", body: form, headers: auth });
    } catch (e) {
      throw new Error(`Could not reach API at ${base}. Is uvicorn running? (${e.message})`);
    }
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  fieldExtractProviders: () => request("/extract/task-fields/providers"),
  extractTaskFields: async (task, file, provider = null) => {
    const form = new FormData();
    form.append("file", file);
    const base = getBase();
    const qs = provider ? `?provider=${encodeURIComponent(provider)}` : "";
    const auth = await authHeaders();
    let res;
    try {
      res = await fetch(`${base}/extract/task-fields/${task}${qs}`, { method: "POST", body: form, headers: auth });
    } catch (e) {
      throw new Error(`Could not reach API at ${base}. Is uvicorn running? (${e.message})`);
    }
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  imageProviders: () => request("/images/providers"),
  generateImage: (prompt) =>
    request("/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    }),
  // Always routed to Azure OpenAI on the backend (image_router.py) — Gemini's image model here
  // is generation-only, it can't take an existing image back in.
  editImage: (prompt, imageBase64, mimeType = "image/png") =>
    request("/images/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, image_base64: imageBase64, mime_type: mimeType }),
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
  // Cross-dataset row-level identity matching (src/entity_resolution.py) — proposes candidate
  // matches between rows of different already-uploaded batch results. `sets` is
  // {task: [{row_index, label}, ...]}; see entityLinksStore.js for persisting confirmed matches.
  matchEntities: (sets, threshold = 0.82) =>
    request("/entity-resolution/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sets, threshold }),
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
// Whether a classification task's positive label (label === 1) represents a risk/negative
// outcome (true) or a desirable outcome (false). Every task except skill_match is a risk flag
// (automation, attrition, turnover); skill_match's target is target_good_redeployment_match,
// so label === 1 there means a GOOD match, not a risk. Centralized here so every UI surface
// that colors/badges a classification result agrees on which way "positive" points, instead of
// each component independently assuming label === 1 always means "bad" (a real bug found 22 Jul:
// PredictionResult/OverallSummary/InteractionExplorer/BatchUpload all rendered a good skill
// match with the same red "risk" styling as an attrition-risk flag).
export const TASK_POSITIVE_IS_RISK = {
  employment: true,
  skills: true,
  skill_match: false,
  human_capital: true,
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

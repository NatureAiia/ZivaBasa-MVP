/*
  Puter.js — free, client-side access to Claude Sonnet 5 / Fable 5 / Opus 4.8 (per
  developer.puter.com), no API key needed because it runs entirely in the browser and Puter
  covers the cost on their end. This was NOT testable from the sandbox this was built in
  (js.puter.com isn't on that sandbox's allowed domain list) — it will only actually run once
  loaded in a real browser. Verify the response shape against your own browser console before
  trusting this blindly; Puter's exact return shape (string vs. {message:{content}} vs. other)
  wasn't independently confirmed here.
*/

const SCRIPT_URL = "https://js.puter.com/v2/";
let loadPromise = null;

export function loadPuter() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window (SSR context)"));
  if (window.puter) return Promise.resolve(window.puter);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.puter) resolve(window.puter);
      else reject(new Error("Puter script loaded but window.puter is undefined"));
    };
    script.onerror = () => reject(new Error(`Could not load ${SCRIPT_URL} — check your network/adblocker`));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export const PUTER_MODELS = {
  "claude-sonnet-5": "Claude Sonnet 5 — balanced, agentic, $2/$10 per M tokens (intro pricing thru Aug 31 2026)",
  "claude-fable-5": "Claude Fable 5 — most capable, $10/$50 per M tokens",
  "claude-opus-4-8": "Claude Opus 4.8 — flagship reasoning",
};

export async function sendPuterChat(messages, model = "claude-sonnet-5") {
  const puter = await loadPuter();
  const puterMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  const response = await puter.ai.chat(puterMessages, { model: `anthropic/${model}` });

  // Defensive extraction — Puter's exact return shape wasn't independently verified here,
  // so handle the plausible shapes rather than assume one and crash on the others.
  if (typeof response === "string") return response;
  if (response?.message?.content) {
    const c = response.message.content;
    return typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => b.text || "").join("") : String(c);
  }
  if (response?.text) return response.text;
  if (response?.content) return typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  return JSON.stringify(response); // last resort — surface something rather than silently fail
}

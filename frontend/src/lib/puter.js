/*
  Puter.js — free, client-side access to several models (per developer.puter.com), no API key
  needed because it runs entirely in the browser and Puter covers the cost on their end. This
  was NOT testable from the sandbox this was built in (js.puter.com isn't on that sandbox's
  allowed domain list) — it will only actually run once loaded in a real browser. Verify the
  response shape against your own browser console before trusting this blindly; Puter's exact
  return shape (string vs. {message:{content}} vs. other) wasn't independently confirmed here.
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

// Keys are the FULL Puter model id (provider/model), not bare model names — sendPuterChat
// used to assume every model needed an "anthropic/" prefix bolted on, which silently broke
// the moment a non-Anthropic model was added here. Passing the whole id avoids that class of
// bug entirely: whatever's typed here is exactly what gets sent, no guessed prefix.
export const PUTER_MODELS = {
  "anthropic/claude-sonnet-5": "Claude Sonnet 5 — balanced, agentic, $2/$10 per M tokens (intro pricing thru Aug 31 2026)",
  "anthropic/claude-fable-5": "Claude Fable 5 — most capable, $10/$50 per M tokens",
  "anthropic/claude-opus-4-8": "Claude Opus 4.8 — flagship reasoning",
  // Fully free, open-source, no API key anywhere in the chain (not even Puter's own metered
  // models above) — good default for basic/simple questions where you don't need tool access
  // or top-tier reasoning.
  "deepseek/deepseek-chat": "DeepSeek V3 — free, open-source, solid for everyday/basic questions",
  "deepseek/deepseek-reasoner": "DeepSeek R1 — free, open-source, shows its reasoning step-by-step, better for logic/math than V3",
};

export async function sendPuterChat(messages, model = "anthropic/claude-sonnet-5") {
  const puter = await loadPuter();
  const puterMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  const response = await puter.ai.chat(puterMessages, { model });

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

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, ChevronDown, KeyRound, Plus, Paperclip, X, Pencil } from "lucide-react";
import clsx from "clsx";
import { fadeUpItem } from "../../lib/motion";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/authStore";
import { sendPuterChat, PUTER_MODELS } from "../../lib/puter";
import { logUsage } from "../../lib/usageStore";
import { estimateCostUsd, estimateImageCostUsd, PRICING_PER_M_TOKENS } from "../../lib/chatPricing";
import { getChatSession, saveChatSession, clearChatSession } from "../../lib/chatSessionStore";
import ClarityRing from "../common/ClarityRing";
import ChatMarkdown from "./ChatMarkdown";

const SUGGESTIONS = [
  "What's the automation risk for a $45k role with high task repetition?",
  "Explain the biggest driver of attrition risk",
  "Summarize productivity in plain language",
  "What data do you need from me?",
];

// Inline "/" quick-actions in the input box — pattern adapted from NeuroWorks's slash-command
// palette (Chat.tsx SLASH_COMMANDS), reworked around ZivaBasa's own tasks. Complements, rather
// than replaces, the suggestion chips above (those are one-tap sends; these are text templates
// the person can still edit before sending).
const SLASH_COMMANDS = [
  { cmd: "/predict", text: "/predict employment role: ", hint: "Run a prediction for a task" },
  { cmd: "/explain", text: "/explain the last prediction", hint: "Ask what drove a result" },
  { cmd: "/forecast", text: "/forecast next 12 months for ", hint: "Ask for a multi-period outlook" },
  { cmd: "/image", text: "/image generate an illustration of ", hint: "Generate an image" },
  { cmd: "/edit", text: "/edit the attached image: ", hint: "Edit an attached or generated image" },
];

const PUTER_SYSTEM = "You are the ZivaBasa workforce intelligence assistant, embedded in ChiedzaAI. " +
  "You do not have live access to the Employment/Skills/Productivity/Skill Match prediction models in this mode " +
  "(that requires one of the 'Backend' models) — answer from general knowledge, and if the person asks for " +
  "an actual prediction, tell them to switch to a Backend model for that.\n\n" +
  "HOW TO WRITE:\n" +
  "- Format like a normal Claude conversation: real markdown (## headers, **bold**, bullet/" +
  "numbered lists, code blocks) when it genuinely makes a longer or structured answer easier to " +
  "scan, plain flowing prose for quick conversational answers. Use your judgment the way you " +
  "normally would — don't force headers onto a two-sentence answer, and don't force prose onto " +
  "something that's naturally a list or step-by-step explanation.\n" +
  "- Keep answers as short as the question allows. A yes/no-shaped question gets a short answer, " +
  "not a full structured writeup.\n" +
  "- If something is genuinely ambiguous or you're missing information, ask one specific " +
  "clarifying question and stop — don't guess silently.";

// Puter's models shown with the same {label, description} shape as the backend catalog, so
// the whole menu (backend models + Puter models) renders from one list instead of two
// differently-shaped option sets bolted together.
const PUTER_OPTION_GROUP = {
  key: "puter",
  title: "Free, no key needed (runs in your browser)",
  options: Object.entries(PUTER_MODELS).map(([id, desc]) => ({
    id,
    label: desc.split(" — ")[0],
    description: desc.split(" — ")[1] || "",
    keyPresent: true,
  })),
};

// Shown next to a backend model's name once it's actually usable (key present), so the cost
// tradeoff vs. the always-free Puter models is visible before picking one, not just discoverable
// after the first bill.
function costLabel(provider) {
  const rate = PRICING_PER_M_TOKENS[provider];
  if (!rate) return null;
  if (rate.input === 0 && rate.output === 0) return "Free";
  return `$${rate.input}/$${rate.output} per 1M tok`;
}

const WELCOME_MESSAGE = {
  role: "assistant",
  text:
    "Ask away — the model selected above is ready to go, and you can switch any time. Models " +
    "marked \"needs API key\" need that key added to your backend's .env first. The Puter " +
    "models work immediately with no setup, but can't run live predictions; a Backend model can.",
};

export default function ChatPane() {
  const { user } = useAuth();
  const [backendModels, setBackendModels] = useState([]);
  const [selection, setSelection] = useState({ mode: "puter", id: "anthropic/claude-sonnet-5" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [toolCallLog, setToolCallLog] = useState([]); // for the Chat report's "predictions made" section
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  // The image the person is currently referring to for an edit — either just uploaded, or a
  // previously generated image they clicked "Edit" on. Sent as `attachment` on the next /chat
  // call so the backend's edit_image tool has pixels to work with (see api/chat.py's
  // attachment threading); cleared once that message is sent.
  const [attachment, setAttachment] = useState(null); // { imageBase64, mimeType, label }
  const fileInputRef = useRef(null);
  const endRef = useRef(null);
  const scrollRef = useRef(null);
  const wasNearBottomRef = useRef(true);

  const attachFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] || "";
      setAttachment({ imageBase64: base64, mimeType: file.type, label: file.name });
    };
    reader.readAsDataURL(file);
  };

  const attachGeneratedImage = (img, label) => {
    setAttachment({ imageBase64: img.image_base64, mimeType: img.mime_type, label });
  };

  useEffect(() => {
    getChatSession().then((session) => {
      if (session.messages.length) setMessages(session.messages);
      setToolCallLog(session.toolCallLog);
      setSessionLoaded(true);
    });
  }, []);

  useEffect(() => {
    // Just populate the catalog — do NOT auto-switch selection to a backend model even if a
    // key is configured. The free Puter model stays the default; a keyed backend model (with
    // its per-token cost shown below) is available to pick, not switched to automatically.
    api.chatModels()
      .then((res) => setBackendModels(res.models || []))
      .catch(() => {}); // backend not reachable yet — Puter still works standalone
  }, []);

  // Near-bottom-aware auto-scroll — pattern adapted from NeuroWorks's Chat.tsx (ResizeObserver
  // instead of a `messages`-dependency effect). Only sticks to the bottom if the reader was
  // already close to it; someone who's scrolled up to re-read earlier messages doesn't get
  // yanked back down by a new reply arriving.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateNearBottom = () => {
      wasNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener("scroll", updateNearBottom, { passive: true });
    const ro = new ResizeObserver(() => {
      if (wasNearBottomRef.current) endRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateNearBottom);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    // Only persist once the initial load has completed — otherwise the [WELCOME_MESSAGE]
    // default would overwrite a real saved session before it's had a chance to load.
    if (!sessionLoaded) return;
    saveChatSession(messages, toolCallLog).catch((e) => console.error("saveChatSession failed:", e.message));
  }, [messages, toolCallLog, sessionLoaded]);

  const selectedLabel = () => {
    if (selection.mode === "chiedza") return "Chiedza (agent)";
    if (selection.mode === "backend") {
      return backendModels.find((m) => m.provider === selection.id)?.label || "Choose a model";
    }
    return PUTER_OPTION_GROUP.options.find((o) => o.id === selection.id)?.label || "Choose a model";
  };

  const send = async (text) => {
    const t = (text ?? input).trim();
    if (!t || sending) return;
    const nextMessages = [...messages, { role: "user", text: t, attachmentLabel: attachment?.label }];
    const pendingAttachment = attachment; // captured before the clear below
    wasNearBottomRef.current = true; // sending a message always re-anchors the view to the bottom
    setMessages(nextMessages);
    setInput("");
    setAttachment(null);
    setSending(true);
    try {
      let replyText, replyProvider, replyImages;
      if (selection.mode === "chiedza") {
        const res = await api.chatAgent(nextMessages.map((m) => ({ role: m.role, content: m.text })), user?.id);
        replyText = res.reply;
        replyProvider = res.provider;
        if (res.tool_calls?.length) {
          setToolCallLog((log) => [...log, ...res.tool_calls]);
        }
        // No token usage reported by agent_graph.py today (LangGraph's ChatAnthropic wrapper
        // doesn't surface it through create_react_agent's return shape) — nothing to log here,
        // unlike the backend branch below.
      } else if (selection.mode === "puter") {
        const history = [
          { role: "system", content: PUTER_SYSTEM },
          ...nextMessages.map((m) => ({ role: m.role, content: m.text })),
        ];
        replyText = await sendPuterChat(history, selection.id);
        replyProvider = `puter:${selection.id}`;
        // Genuinely free — no token accounting available from Puter's response, but still
        // logged so the usage summary reflects real message volume, not just backend calls.
        logUsage({ provider: replyProvider, model: selection.id, inputTokens: 0, outputTokens: 0, costUsd: 0 })
          .catch((e) => console.error("logUsage failed:", e.message));
      } else {
        const res = await api.chat(
          nextMessages.map((m) => ({ role: m.role, content: m.text })),
          selection.id,
          pendingAttachment
            ? { image_base64: pendingAttachment.imageBase64, mime_type: pendingAttachment.mimeType }
            : null,
        );
        replyText = res.reply;
        replyProvider = res.provider;
        const inputTokens = res.usage?.input_tokens || 0;
        const outputTokens = res.usage?.output_tokens || 0;
        logUsage({
          provider: replyProvider,
          model: backendModels.find((m) => m.provider === replyProvider)?.model || replyProvider,
          inputTokens,
          outputTokens,
          costUsd: estimateCostUsd(replyProvider, inputTokens, outputTokens),
        }).catch((e) => console.error("logUsage failed:", e.message));
        if (res.tool_calls?.length) {
          setToolCallLog((log) => [...log, ...res.tool_calls]);
        }
        replyImages = res.generated_images;
        if (replyImages?.length) {
          // Image generation is billed separately from the text call it rode in on (it always
          // goes through Gemini's image model regardless of which chat provider is active), so
          // it gets its own usage_log entry rather than being folded into the text cost above.
          const imagesByProvider = {};
          for (const img of replyImages) (imagesByProvider[img.provider] ??= []).push(img);
          for (const [imgProvider, imgs] of Object.entries(imagesByProvider)) {
            logUsage({
              provider: `${imgProvider}:image`,
              model: imgs[0].model,
              inputTokens: 0,
              outputTokens: 0,
              costUsd: estimateImageCostUsd(imgProvider, imgs.length),
            }).catch((e) => console.error("logUsage failed:", e.message));
          }
        }
      }
      setMessages((m) => [...m, { role: "assistant", text: replyText, provider: replyProvider, images: replyImages }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Couldn't get a response: ${e.message}`, isError: true }]);
    } finally {
      setSending(false);
    }
  };

  const newChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setToolCallLog([]);
    setInput("");
    clearChatSession().catch((e) => console.error("clearChatSession failed:", e.message));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Model picker */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs font-medium text-ink bg-surface2 border border-border rounded-lg px-2.5 py-1.5 hover:border-gold/40 transition-colors"
          >
            {selectedLabel()}
            <ChevronDown size={12} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute z-10 mt-1 bg-surface border border-border rounded-xl shadow-card-dark p-1.5 w-72 flex flex-col gap-2"
              >
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold px-1.5 pb-1">
                    Chiedza — reads your own app data
                  </p>
                  <button
                    onClick={() => { setSelection({ mode: "chiedza", id: "chiedza" }); setMenuOpen(false); }}
                    className={clsx(
                      "w-full text-left px-2.5 py-2 rounded-lg transition-colors",
                      selection.mode === "chiedza" ? "bg-gold/10" : "hover:bg-surface2"
                    )}
                  >
                    <span className={clsx("text-xs font-medium", selection.mode === "chiedza" ? "text-gold" : "text-ink")}>
                      Chiedza (agent)
                    </span>
                    <span className="block text-[10px] text-ink-faint mt-0.5 leading-snug">
                      Grounds answers in your own org chart, prediction history and batch results — not just fresh predictions.
                    </span>
                  </button>
                </div>
                {backendModels.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold px-1.5 pb-1">
                      Backend models — can run live predictions
                    </p>
                    {backendModels.map((m) => (
                      <button
                        key={m.provider}
                        disabled={!m.key_present}
                        onClick={() => { setSelection({ mode: "backend", id: m.provider }); setMenuOpen(false); }}
                        className={clsx(
                          "w-full text-left px-2.5 py-2 rounded-lg transition-colors",
                          !m.key_present && "opacity-45 cursor-not-allowed",
                          selection.mode === "backend" && selection.id === m.provider
                            ? "bg-gold/10"
                            : m.key_present && "hover:bg-surface2"
                        )}
                      >
                        <span className={clsx("text-xs font-medium flex items-center gap-1.5", selection.id === m.provider && selection.mode === "backend" ? "text-gold" : "text-ink")}>
                          {m.label}
                          {!m.key_present && <KeyRound size={10} className="text-ink-faint" />}
                          {m.key_present && costLabel(m.provider) && (
                            <span
                              className={clsx(
                                "text-[9px] font-normal rounded px-1 py-0.5 border",
                                costLabel(m.provider) === "Free"
                                  ? "text-teal border-teal/30 bg-teal/10"
                                  : "text-ink-faint border-border bg-surface2"
                              )}
                            >
                              {costLabel(m.provider)}
                            </span>
                          )}
                        </span>
                        <span className="block text-[10px] text-ink-faint mt-0.5 leading-snug">
                          {m.key_present ? m.description : "Needs an API key added to your backend"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold px-1.5 pb-1">
                    {PUTER_OPTION_GROUP.title}
                  </p>
                  {PUTER_OPTION_GROUP.options.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => { setSelection({ mode: "puter", id: o.id }); setMenuOpen(false); }}
                      className={clsx(
                        "w-full text-left px-2.5 py-2 rounded-lg transition-colors",
                        selection.mode === "puter" && selection.id === o.id ? "bg-gold/10" : "hover:bg-surface2"
                      )}
                    >
                      <span className={clsx("text-xs font-medium", selection.mode === "puter" && selection.id === o.id ? "text-gold" : "text-ink")}>
                        {o.label}
                      </span>
                      <span className="block text-[10px] text-ink-faint mt-0.5 leading-snug">{o.description}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={newChat}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink bg-surface2 border border-border rounded-lg px-2.5 py-1.5 hover:border-gold/40 transition-colors"
          >
            <Plus size={13} /> New chat
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              variants={fadeUpItem}
              initial="hidden"
              animate="show"
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "self-end bg-gold text-bg"
                  : m.isError
                  ? "self-start bg-red/10 text-red border border-red/25"
                  : "self-start bg-surface2 text-ink"
              }`}
            >
              {m.role === "assistant" && !m.isError ? <ChatMarkdown text={m.text} /> : m.text}
              {m.role === "user" && m.attachmentLabel && (
                <div className="text-[10px] text-bg/70 mt-1">📎 {m.attachmentLabel}</div>
              )}
              {m.images?.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  {m.images.map((img) => (
                    <div key={img.id} className="flex flex-col gap-1">
                      <img
                        src={`data:${img.mime_type};base64,${img.image_base64}`}
                        alt={img.provider === "azure" ? "Generated by Azure OpenAI" : "Generated by Gemini"}
                        className="rounded-lg border border-border max-w-full"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-ink-faint">
                          Generated by {img.provider === "azure" ? "Azure OpenAI" : "Gemini"} · ~$
                          {estimateImageCostUsd(img.provider, 1).toFixed(3)} estimated
                        </span>
                        <button
                          onClick={() => attachGeneratedImage(img, "This image")}
                          className="flex items-center gap-1 text-[10px] text-ink-faint hover:text-gold transition-colors"
                        >
                          <Pencil size={10} /> Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {m.provider && <div className="text-[10px] text-ink-faint mt-1.5">via {m.provider}</div>}
            </motion.div>
          ))}
          {sending && (
            <motion.div variants={fadeUpItem} initial="hidden" animate="show" className="self-start flex items-center gap-2 px-2">
              <ClarityRing mode="loading" size={20} strokeWidth={3} color="gold" />
              <span className="text-xs text-ink-faint">Thinking…</span>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-3 flex flex-col gap-2 bg-surface">
        {attachment && (
          <div className="flex items-center gap-2 bg-surface2 border border-gold/30 rounded-lg px-2.5 py-1.5 w-fit">
            <img
              src={`data:${attachment.mimeType};base64,${attachment.imageBase64}`}
              alt="Attached"
              className="w-6 h-6 rounded object-cover"
            />
            <span className="text-[10px] text-ink-muted">Attached — describe the edit you want</span>
            <button onClick={() => setAttachment(null)} aria-label="Remove attachment" className="text-ink-faint hover:text-ink">
              <X size={12} />
            </button>
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          {SUGGESTIONS.map((s) => (
            <motion.button
              key={s}
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => send(s)}
              disabled={sending}
              className="shrink-0 flex items-center gap-1.5 text-xs text-ink-muted bg-surface2 border border-border rounded-full px-3 py-1.5 hover:border-gold/40 hover:text-ink transition-colors disabled:opacity-50"
            >
              <Sparkles size={11} className="text-gold" /> {s}
            </motion.button>
          ))}
        </div>
        <div className="relative flex gap-2">
          <AnimatePresence>
            {slashOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute bottom-full mb-2 left-0 right-0 bg-surface border border-border rounded-xl shadow-card-dark p-1.5 flex flex-col gap-0.5 max-h-48 overflow-y-auto"
              >
                {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input.trim() || "/")).map((c) => (
                  <button
                    key={c.cmd}
                    onClick={() => { setInput(c.text); setSlashOpen(false); }}
                    className="text-left px-2.5 py-1.5 rounded-lg hover:bg-surface2 transition-colors"
                  >
                    <span className="text-xs font-mono text-gold">{c.cmd}</span>
                    <span className="block text-[10px] text-ink-faint mt-0.5">{c.hint}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <input
            value={input}
            onChange={(e) => {
              const v = e.target.value;
              setInput(v);
              setSlashOpen(v.startsWith("/") && !v.includes(" "));
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSlashOpen(false);
              if (e.key === "Enter" && !slashOpen) send();
            }}
            placeholder={
              attachment
                ? "Describe the edit you want to make to the attached image…"
                : "Ask about a forecast, scenario, or role… (try / for quick actions)"
            }
            disabled={sending}
            className="flex-1 bg-surface2 border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gold/50 transition-colors disabled:opacity-60"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { attachFile(e.target.files?.[0]); e.target.value = ""; }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="bg-surface2 border border-border text-ink-muted rounded-xl px-3 flex items-center justify-center hover:border-gold/40 hover:text-ink transition-colors disabled:opacity-50"
            aria-label="Attach an image to edit"
            title="Attach an image to edit"
          >
            <Paperclip size={16} />
          </button>
          <button
            onClick={() => send()}
            disabled={sending}
            className="bg-gold text-bg rounded-xl px-3.5 flex items-center justify-center hover:brightness-110 transition-all disabled:opacity-50"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

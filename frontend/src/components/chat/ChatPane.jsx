import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, AlertTriangle, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { fadeUpItem } from "../../lib/motion";
import { api } from "../../lib/api";
import { sendPuterChat, PUTER_MODELS } from "../../lib/puter";
import ClarityRing from "../common/ClarityRing";

const SUGGESTIONS = [
  "What's the automation risk for a $45k role with high task repetition?",
  "Explain the biggest driver of attrition risk",
  "Summarize productivity in plain language",
  "What data do you need from me?",
];

const PUTER_SYSTEM = "You are the ZivaBasa workforce intelligence assistant, embedded in ChiedzaAI. " +
  "You do not have live access to the Employment/Skills/Productivity prediction models in this mode " +
  "(that requires the 'Backend' provider) — answer from general knowledge, and if the person asks for " +
  "an actual prediction, tell them to switch to the Backend provider for that.";

const PROVIDERS = [
  { key: "puter", label: "Puter (free, no key)" },
  { key: "backend", label: "Backend (predict/explain tools)" },
];

export default function ChatPane() {
  const [provider, setProvider] = useState("puter");
  const [puterModel, setPuterModel] = useState("claude-sonnet-5");
  const [menuOpen, setMenuOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text:
        "Using Puter (free, no API key) by default — I can chat but can't call the ZivaBasa " +
        "prediction models directly here. Switch to \"Backend\" above for real predict/explain " +
        "tool calls (needs an Anthropic or NVIDIA key configured on your server).",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text) => {
    const t = (text ?? input).trim();
    if (!t || sending) return;
    const nextMessages = [...messages, { role: "user", text: t }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    try {
      let replyText, replyProvider;
      if (provider === "puter") {
        const history = [
          { role: "system", content: PUTER_SYSTEM },
          ...nextMessages.map((m) => ({ role: m.role, content: m.text })),
        ];
        replyText = await sendPuterChat(history, puterModel);
        replyProvider = `puter:${puterModel}`;
      } else {
        const res = await api.chat(nextMessages.map((m) => ({ role: m.role, content: m.text })));
        replyText = res.reply;
        replyProvider = res.provider;
      }
      setMessages((m) => [...m, { role: "assistant", text: replyText, provider: replyProvider }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Couldn't get a response: ${e.message}`, isError: true }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Provider selector */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs font-medium text-ink bg-surface2 border border-border rounded-lg px-2.5 py-1.5 hover:border-gold/40 transition-colors"
          >
            {PROVIDERS.find((p) => p.key === provider)?.label}
            <ChevronDown size={12} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute z-10 mt-1 bg-surface border border-border rounded-xl shadow-card-dark p-1 w-56"
              >
                {PROVIDERS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => { setProvider(p.key); setMenuOpen(false); }}
                    className={clsx(
                      "w-full text-left text-xs px-2.5 py-2 rounded-lg transition-colors",
                      provider === p.key ? "bg-gold/10 text-gold" : "text-ink-muted hover:bg-surface2 hover:text-ink"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {provider === "puter" && (
          <select
            value={puterModel}
            onChange={(e) => setPuterModel(e.target.value)}
            className="text-xs bg-surface2 border border-border rounded-lg px-2 py-1.5 text-ink-muted outline-none"
          >
            {Object.keys(PUTER_MODELS).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
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
              {m.text}
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
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about a forecast, scenario, or role…"
            disabled={sending}
            className="flex-1 bg-surface2 border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gold/50 transition-colors disabled:opacity-60"
          />
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

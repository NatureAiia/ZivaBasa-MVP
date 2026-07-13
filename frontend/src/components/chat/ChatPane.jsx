import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, AlertTriangle } from "lucide-react";
import { fadeUpItem } from "../../lib/motion";
import { api } from "../../lib/api";
import ClarityRing from "../common/ClarityRing";

const SUGGESTIONS = [
  "What's the automation risk for a $45k role with high task repetition?",
  "Explain the biggest driver of attrition risk",
  "Summarize productivity in plain language",
  "What data do you need from me?",
];

export default function ChatPane() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text:
        "I can call the ZivaBasa Employment, Skills, and Productivity models directly — ask me " +
        "about a scenario (e.g. \"what's the automation risk for a $45,000 role with high task " +
        "repetition?\") and I'll run the prediction and explain it. This needs a chat provider " +
        "(Anthropic or NVIDIA) configured with an API key on the backend — if that's not set up " +
        "yet, I'll tell you rather than pretend to answer.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [providerError, setProviderError] = useState(null);
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
    setProviderError(null);
    try {
      const res = await api.chat(nextMessages.map((m) => ({ role: m.role, content: m.text })));
      setMessages((m) => [...m, { role: "assistant", text: res.reply, provider: res.provider }]);
    } catch (e) {
      setProviderError(e.message);
      setMessages((m) => [...m, { role: "assistant", text: `Couldn't get a response: ${e.message}`, isError: true }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
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

      {providerError?.includes("No chat provider configured") && (
        <div className="mx-4 mb-2 flex items-start gap-2 text-[11px] text-gold bg-gold/10 border border-gold/25 rounded-xl px-3 py-2">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>Set ANTHROPIC_API_KEY or NVIDIA_API_KEY on the backend to enable chat.</span>
        </div>
      )}

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

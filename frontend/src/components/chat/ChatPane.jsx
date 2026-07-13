import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles } from "lucide-react";
import { fadeUpItem } from "../../lib/motion";

const SUGGESTIONS = [
  "Create training roadmap",
  "Compare to last run",
  "Explain the biggest risk driver",
  "Summarize in plain language",
];

export default function ChatPane() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text:
        "This chat panel is a UI prototype — it isn't wired to a live conversational model yet. " +
        "For real predictions, use the Predict tab; it's fully connected to the ZivaBasa API. " +
        "I'll echo what you send here so you can see the interaction pattern.",
    },
  ]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = (text) => {
    const t = (text ?? input).trim();
    if (!t) return;
    setMessages((m) => [
      ...m,
      { role: "user", text: t },
      { role: "assistant", text: `Prototype echo — no live model connected yet: "${t}"` },
    ]);
    setInput("");
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
                  : "self-start bg-surface2 text-ink"
              }`}
            >
              {m.text}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      {/* Sticky input with horizontally-scrolling suggestion chips */}
      <div className="border-t border-border p-3 flex flex-col gap-2 bg-surface">
        <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          {SUGGESTIONS.map((s) => (
            <motion.button
              key={s}
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => send(s)}
              className="shrink-0 flex items-center gap-1.5 text-xs text-ink-muted bg-surface2 border border-border rounded-full px-3 py-1.5 hover:border-gold/40 hover:text-ink transition-colors"
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
            className="flex-1 bg-surface2 border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gold/50 transition-colors"
          />
          <button
            onClick={() => send()}
            className="bg-gold text-bg rounded-xl px-3.5 flex items-center justify-center hover:brightness-110 transition-all"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

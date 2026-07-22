import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, MessageCircle, X } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/authStore";
import ClarityRing from "../common/ClarityRing";
import ChatMarkdown from "./ChatMarkdown";

// Displayed once as the first bubble, computed locally — never sent to the backend as part of
// the actual chatAgent conversation (mirrors ChatPane.jsx's WELCOME_MESSAGE pattern).
function greeting({ signedIn, profile, user, role }) {
  if (!signedIn) {
    return "Hi, I'm Chiedza — how may I assist you?";
  }
  const firstName = (profile?.full_name || user?.email?.split("@")[0] || "there").split(" ")[0];
  const base = `Hi ${firstName}, I'm Chiedza — welcome back!`;
  return role === "admin" ? `${base} You've got org-wide access, so ask me anything across the platform.` : base;
}

export default function ChiedzaWidget() {
  const { user, profile, role, signedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(null); // lazily seeded on first open, so the greeting reflects the freshest auth state
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (open && messages === null) {
      setMessages([{ role: "assistant", text: greeting({ signedIn, profile, user, role }) }]);
    }
  }, [open, messages, signedIn, profile, user, role]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text) => {
    const t = (text ?? input).trim();
    if (!t || sending) return;
    const nextMessages = [...(messages || []), { role: "user", text: t }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    try {
      const res = await api.chatAgent(
        nextMessages.map((m) => ({ role: m.role, content: m.text })),
        user?.id ?? null
      );
      setMessages((m) => [...m, { role: "assistant", text: res.reply, provider: res.provider }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Couldn't get a response: ${e.message}`, isError: true }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-gold text-bg shadow-card-dark hover:brightness-110 transition-all"
        aria-label={open ? "Close Chiedza" : "Open Chiedza"}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="fixed bottom-24 right-6 z-50 w-[min(92vw,380px)] h-[min(70vh,540px)] bg-surface border border-border rounded-2xl shadow-card-dark flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ClarityRing mode="static" size={22} strokeWidth={3} color="gold" />
                <div>
                  <p className="text-sm font-semibold text-ink leading-tight">Chiedza</p>
                  <p className="text-[10px] text-ink-faint leading-tight">
                    {!signedIn
                      ? "Product assistant"
                      : role === "admin"
                      ? "Org-wide access"
                      : "Your ZivaBasa assistant"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-ink-faint hover:text-ink transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {(messages || []).map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "self-end bg-gold text-bg"
                        : m.isError
                        ? "self-start bg-red/10 text-red border border-red/25"
                        : "self-start bg-surface2 text-ink"
                    }`}
                  >
                    {m.role === "assistant" && !m.isError ? <ChatMarkdown text={m.text} /> : m.text}
                  </motion.div>
                ))}
                {sending && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="self-start flex items-center gap-2 px-1">
                    <ClarityRing mode="loading" size={16} strokeWidth={3} color="gold" />
                    <span className="text-xs text-ink-faint">Thinking…</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={endRef} />
            </div>

            {!signedIn && (
              <div className="px-4 py-1.5 border-t border-border bg-surface2/50">
                <Link to="/login" className="text-[11px] text-gold hover:underline">
                  Sign in for personalized answers →
                </Link>
              </div>
            )}

            <div className="border-t border-border p-3 flex gap-2 bg-surface">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask Chiedza…"
                disabled={sending}
                className="flex-1 bg-surface2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/50 transition-colors disabled:opacity-60"
              />
              <button
                onClick={() => send()}
                disabled={sending}
                className="bg-gold text-bg rounded-xl px-3 flex items-center justify-center hover:brightness-110 transition-all disabled:opacity-50"
                aria-label="Send"
              >
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

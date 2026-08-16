import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Boxes, Loader2, KeyRound } from "lucide-react";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import { staggerContainer } from "../../lib/motion";
import { api } from "../../lib/api";

/*
  Systems -> Models & API — surfaces data GET /chat/models and GET /chat/budget already return
  (api/llm_gateway.py's budget_status(), built for Section 5a's LLM cost governance) but that no
  page in the frontend ever rendered before this. Read-only — provider keys/budgets are
  configured via backend .env, not from here.
*/
export default function ModelsTab() {
  const [models, setModels] = useState(null);
  const [budget, setBudget] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.chatModels(), api.chatBudget()])
      .then(([m, b]) => {
        setModels(m.models || []);
        setBudget(b);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto w-full">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink flex items-center gap-2">
              <Boxes size={20} className="text-gold" /> Models &amp; API
            </h1>
            <p className="text-xs text-ink-muted mt-1">Chat provider status and today's token budget.</p>
          </div>

          {error && (
            <div className="text-xs text-red bg-red/10 border border-red/25 rounded-xl px-3 py-2.5">{error}</div>
          )}

          {!models ? (
            <div className="flex items-center gap-2 text-xs text-ink-faint py-6 justify-center">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            <Card animated={false} className="!p-0 overflow-hidden">
              <div className="flex flex-col divide-y divide-border">
                {models.map((m) => {
                  const b = budget?.[m.provider];
                  const capped = b?.budget_tokens_per_day != null;
                  const usedPct = capped ? Math.min(100, (b.used_today / b.budget_tokens_per_day) * 100) : 0;
                  return (
                    <motion.div
                      key={m.provider}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col gap-2 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-ink flex items-center gap-1.5">
                            {m.label}
                            {!m.key_present && <KeyRound size={11} className="text-ink-faint" />}
                          </div>
                          <div className="text-[11px] text-ink-faint truncate">{m.description}</div>
                        </div>
                        <Badge tone={m.key_present ? "teal" : "neutral"}>
                          {m.key_present ? "Key configured" : "No key"}
                        </Badge>
                      </div>
                      {m.key_present && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
                            {capped && (
                              <div
                                className={`h-full rounded-full ${usedPct >= 90 ? "bg-red" : usedPct >= 60 ? "bg-gold" : "bg-teal"}`}
                                style={{ width: `${usedPct}%` }}
                              />
                            )}
                          </div>
                          <span className="text-[10px] text-ink-faint font-mono shrink-0">
                            {capped
                              ? `${b.used_today.toLocaleString()} / ${b.budget_tokens_per_day.toLocaleString()} tok today`
                              : "No daily cap set"}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
}

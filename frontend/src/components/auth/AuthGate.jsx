import { useState } from "react";
import { motion } from "framer-motion";
import { LogIn, UserPlus, AlertTriangle } from "lucide-react";
import { useAuth } from "../../lib/authStore";
import Card from "../common/Card";
import Button from "../common/Button";
import ClarityRing from "../common/ClarityRing";
import ThemeToggle from "../layout/ThemeToggle";
import GlitterWrap from "./GlitterWrap";

function ConfigMissingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-bg text-ink px-4">
      <Card className="max-w-md flex flex-col gap-3" animated={false}>
        <div className="flex items-center gap-2 text-red">
          <AlertTriangle size={18} />
          <h1 className="font-display font-semibold">Supabase not configured</h1>
        </div>
        <p className="text-sm text-ink-muted">
          Set <code className="text-ink bg-surface2 rounded px-1">VITE_SUPABASE_URL</code> and{" "}
          <code className="text-ink bg-surface2 rounded px-1">VITE_SUPABASE_ANON_KEY</code> in{" "}
          <code className="text-ink bg-surface2 rounded px-1">frontend/.env</code> (copy from{" "}
          <code className="text-ink bg-surface2 rounded px-1">.env.example</code>), then restart
          the dev server.
        </p>
      </Card>
    </div>
  );
}

function LoginForm() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("signIn"); // "signIn" | "signUp"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signIn") {
        const { error: err } = await signIn(email, password);
        if (err) throw err;
      } else {
        const { error: err } = await signUp(email, password);
        if (err) throw err;
        setInfo("Account created. Check your email to confirm, then sign in.");
        setMode("signIn");
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative h-screen flex items-center justify-center bg-bg text-ink px-4 overflow-hidden">
      <GlitterWrap />

      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <motion.div className="relative z-10" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="w-[340px] flex flex-col gap-5" animated={false}>
          <div className="flex items-center gap-2.5">
            <ClarityRing mode="static" size={32} strokeWidth={4} color="gold" />
            <div>
              <div className="font-display text-lg font-bold leading-tight">ChiedzaAI</div>
              <div className="text-[11px] text-ink-faint leading-tight">ZivaBasa</div>
            </div>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/50"
                autoComplete="email"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/50"
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              />
            </label>

            {error && <p className="text-xs text-red">{error}</p>}
            {info && <p className="text-xs text-teal">{info}</p>}

            <Button type="submit" disabled={busy} className="w-full mt-1">
              {mode === "signIn" ? <LogIn size={15} /> : <UserPlus size={15} />}
              {busy ? "Please wait…" : mode === "signIn" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "signIn" ? "signUp" : "signIn"));
              setError(null);
              setInfo(null);
            }}
            className="text-xs text-ink-faint hover:text-ink text-center"
          >
            {mode === "signIn" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </Card>
      </motion.div>
    </div>
  );
}

export default function AuthGate({ children }) {
  const { configured, loading, signedIn } = useAuth();

  if (!configured) return <ConfigMissingScreen />;
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <ClarityRing mode="loading" size={36} strokeWidth={4} color="gold" />
      </div>
    );
  }
  if (!signedIn) return <LoginForm />;
  return children;
}

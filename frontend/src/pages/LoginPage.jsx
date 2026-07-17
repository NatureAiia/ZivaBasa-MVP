import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { LogIn, UserPlus, ArrowLeft } from "lucide-react";
import { useAuth } from "../lib/authStore";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import ClarityRing from "../components/common/ClarityRing";
import ThemeToggle from "../components/layout/ThemeToggle";
import GlitterWrap from "../components/auth/GlitterWrap";
import ConfigMissingScreen from "../components/auth/ConfigMissingScreen";

export default function LoginPage() {
  const { configured, loading, signedIn, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState(searchParams.get("mode") === "signup" ? "signUp" : "signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && signedIn) navigate("/app", { replace: true });
  }, [loading, signedIn, navigate]);

  if (!configured) return <ConfigMissingScreen />;
  if (loading || signedIn) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <ClarityRing mode="loading" size={36} strokeWidth={4} color="gold" />
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signIn") {
        const { error: err } = await signIn(email, password);
        if (err) throw err;
        navigate("/app", { replace: true });
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

      <Link
        to="/"
        className="absolute top-4 left-4 z-10 flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink transition-colors"
      >
        <ArrowLeft size={14} /> Back to home
      </Link>

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

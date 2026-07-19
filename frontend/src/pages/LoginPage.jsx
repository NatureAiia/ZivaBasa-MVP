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
import { spring } from "../lib/motion";

// One shared form, reordered (not duplicated) between the two halves of the desktop split
// panel. The ternary below swaps which side renders FormPanel vs BrandPanel, which unmounts
// and remounts each at the other tree position — a plain `layout` prop can't animate that (it
// only tracks a persisting instance), so `layoutId` is what tells framer-motion these are the
// same shared box across the swap and animates the FLIP transform between them.
function FormPanel({ mode, email, setEmail, password, setPassword, error, info, busy, onSubmit }) {
  return (
    <motion.div layoutId="login-form-panel" transition={spring} className="w-1/2 shrink-0 flex flex-col justify-center p-8">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-ink mb-1">
          {mode === "signIn" ? "Welcome back" : "Create account"}
        </h2>
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
    </motion.div>
  );
}

// The colored panel always promotes the OTHER action — it covers whichever side isn't the
// active form, and its button is what flips `mode` (and slides itself to the opposite side).
function BrandPanel({ mode, onToggle }) {
  const targetMode = mode === "signIn" ? "signUp" : "signIn";
  return (
    <motion.div
      layoutId="login-brand-panel"
      transition={spring}
      className="w-1/2 shrink-0 bg-gold text-bg flex flex-col justify-center items-start gap-3 p-8"
    >
      <div className="flex items-center gap-2.5">
        <ClarityRing mode="static" size={28} strokeWidth={4} color="indigo" />
        <div className="font-display text-base font-bold leading-tight">ChiedzaAI</div>
      </div>
      <p className="text-sm font-medium leading-snug">
        {mode === "signIn"
          ? "New to ZivaBasa? Create an account to get started."
          : "Already have an account? Sign back in."}
      </p>
      <button
        type="button"
        onClick={onToggle}
        className="mt-1 inline-flex items-center gap-1.5 border border-bg/40 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-bg/10 transition-colors"
      >
        {targetMode === "signIn" ? <LogIn size={15} /> : <UserPlus size={15} />}
        {targetMode === "signIn" ? "Sign in" : "Sign up"}
      </button>
    </motion.div>
  );
}

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

  const toggleMode = () => {
    setMode((m) => (m === "signIn" ? "signUp" : "signIn"));
    setError(null);
    setInfo(null);
  };

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

      {/* Below md: today's single stacked card — a 680px split panel doesn't fit a phone screen. */}
      <motion.div className="relative z-10 md:hidden" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
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
            onClick={toggleMode}
            className="text-xs text-ink-faint hover:text-ink text-center"
          >
            {mode === "signIn" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </Card>
      </motion.div>

      {/* md and up: the animated split panel — brand half slides to whichever side isn't the
          active form when `mode` toggles, via framer-motion's layout-reorder animation. */}
      <motion.div
        className="relative z-10 hidden md:flex w-full max-w-[680px] rounded-2xl overflow-hidden border border-border bg-surface shadow-card dark:shadow-card-dark"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {mode === "signIn" ? (
          <>
            <FormPanel
              mode={mode}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              error={error}
              info={info}
              busy={busy}
              onSubmit={submit}
            />
            <BrandPanel mode={mode} onToggle={toggleMode} />
          </>
        ) : (
          <>
            <BrandPanel mode={mode} onToggle={toggleMode} />
            <FormPanel
              mode={mode}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              error={error}
              info={info}
              busy={busy}
              onSubmit={submit}
            />
          </>
        )}
      </motion.div>
    </div>
  );
}

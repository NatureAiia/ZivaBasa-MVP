import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { LogIn, UserPlus, ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useAuth } from "../lib/authStore";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import ClarityRing from "../components/common/ClarityRing";
import ThemeToggle from "../components/layout/ThemeToggle";
import GlitterWrap from "../components/auth/GlitterWrap";
import ConfigMissingScreen from "../components/auth/ConfigMissingScreen";
import { spring } from "../lib/motion";

// Both panels stay permanently mounted at fixed DOM positions — only their `x` transform
// animates. (An earlier version reordered FormPanel/BrandPanel in the DOM via a ternary and
// relied on framer-motion's `layoutId` to bridge the resulting unmount/remount; that requires
// AnimatePresence to keep the outgoing instance alive for measurement, which this didn't have,
// so the two panels drifted out of sync mid-transition — one snapped instantly, the other
// lagged and overflowed the card. Plain `x` animation on persisting elements has no such
// measurement step, so it can't desync.)
function PasswordField({ value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-ink-faint">Password</span>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          required
          minLength={6}
          value={value}
          onChange={onChange}
          className="w-full bg-surface2 border border-border rounded-lg pl-3 pr-9 py-2 text-sm outline-none focus:border-gold/50"
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
          aria-label={visible ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </label>
  );
}

function FormPanel({
  mode, email, setEmail, password, setPassword,
  fullName, setFullName, organization, setOrganization, jobTitle, setJobTitle,
  requestedRole, setRequestedRole,
  error, info, busy, onSubmit,
}) {
  return (
    <motion.div
      animate={{ x: mode === "signIn" ? "0%" : "100%" }}
      transition={spring}
      className="absolute inset-y-0 left-0 w-1/2 flex flex-col justify-center p-8 bg-surface overflow-y-auto"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-ink mb-1">
          {mode === "signIn" ? "Welcome back" : "Create account"}
        </h2>

        {mode === "signUp" && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">Full name</span>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/50"
                autoComplete="name"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">Organization</span>
              <input
                type="text"
                required
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/50"
                autoComplete="organization"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">Job title</span>
              <input
                type="text"
                required
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/50"
                autoComplete="organization-title"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">Requested role</span>
              <select
                value={requestedRole}
                onChange={(e) => setRequestedRole(e.target.value)}
                className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/50"
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
              <span className="text-[10px] text-ink-faint">
                New accounts start as Viewer — an existing admin grants Admin access.
              </span>
            </label>
          </>
        )}

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
        <PasswordField
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
        />

        {error && <p className="text-xs text-red">{error}</p>}
        {info && (
          <p className="flex items-start gap-1.5 text-xs text-teal bg-teal/10 border border-teal/25 rounded-lg px-3 py-2">
            <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> {info}
          </p>
        )}

        <Button type="submit" disabled={busy} className="w-full mt-1">
          {mode === "signIn" ? <LogIn size={15} /> : <UserPlus size={15} />}
          {busy ? "Please wait…" : mode === "signIn" ? "Sign in" : "Create account"}
        </Button>
      </form>
    </motion.div>
  );
}

// The colored panel always promotes the OTHER action — it covers whichever side isn't the
// active form, and its button is what flips `mode` (sliding both panels to swap sides).
function BrandPanel({ mode, onToggle }) {
  const targetMode = mode === "signIn" ? "signUp" : "signIn";
  return (
    <motion.div
      animate={{ x: mode === "signIn" ? "100%" : "0%" }}
      transition={spring}
      className="absolute inset-y-0 left-0 w-1/2 bg-gold text-bg flex flex-col justify-center items-start gap-3 p-8"
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
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [requestedRole, setRequestedRole] = useState("viewer");
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
        const { error: err } = await signUp(email, password, {
          fullName, organization, jobTitle, requestedRole,
        });
        if (err) throw err;
        setInfo("Account created. Check your email to confirm, then sign in.");
        setMode("signIn");
      }
    } catch (err) {
      // err.message can be present-but-useless — Supabase's hosted auth API has been observed
      // returning a bare `{}` body on a 500 (a server-side failure, e.g. an auth hook throwing),
      // which some SDK versions surface as the literal string "{}" rather than leaving .message
      // empty. `err.message || fallback` doesn't catch that (it's truthy), so a raw JSON blob
      // leaked straight into the UI — checked here explicitly rather than trusting .message's
      // shape.
      const looksLikeJson = typeof err.message === "string" && /^\s*[{[]/.test(err.message);
      setError(!err.message || looksLikeJson ? "Something went wrong. Please try again shortly." : err.message);
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
        <Card className="w-[340px] max-h-[85vh] overflow-y-auto flex flex-col gap-5" animated={false}>
          <div className="flex items-center gap-2.5">
            <ClarityRing mode="static" size={32} strokeWidth={4} color="gold" />
            <div>
              <div className="font-display text-lg font-bold leading-tight">ChiedzaAI</div>
              <div className="text-[11px] text-ink-faint leading-tight">ZivaBasa</div>
            </div>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            {mode === "signUp" && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-ink-faint">Full name</span>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/50"
                    autoComplete="name"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-ink-faint">Organization</span>
                  <input
                    type="text"
                    required
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/50"
                    autoComplete="organization"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-ink-faint">Job title</span>
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/50"
                    autoComplete="organization-title"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-ink-faint">Requested role</span>
                  <select
                    value={requestedRole}
                    onChange={(e) => setRequestedRole(e.target.value)}
                    className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/50"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                  <span className="text-[10px] text-ink-faint">
                    New accounts start as Viewer — an existing admin grants Admin access.
                  </span>
                </label>
              </>
            )}

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
            <PasswordField
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            />

            {error && <p className="text-xs text-red">{error}</p>}
            {info && (
              <p className="flex items-start gap-1.5 text-xs text-teal bg-teal/10 border border-teal/25 rounded-lg px-3 py-2">
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> {info}
              </p>
            )}

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
          active form when `mode` toggles, via framer-motion's layout-reorder animation. Height
          grew from 460 to 600 to fit the signup panel's four extra fields without relying on
          FormPanel's internal scroll except on short viewports. */}
      <motion.div
        className="relative z-10 hidden md:block w-full max-w-[680px] h-[600px] max-h-[85vh] rounded-2xl overflow-hidden border border-border bg-surface shadow-card dark:shadow-card-dark"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <FormPanel
          mode={mode}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          fullName={fullName}
          setFullName={setFullName}
          organization={organization}
          setOrganization={setOrganization}
          jobTitle={jobTitle}
          setJobTitle={setJobTitle}
          requestedRole={requestedRole}
          setRequestedRole={setRequestedRole}
          error={error}
          info={info}
          busy={busy}
          onSubmit={submit}
        />
        <BrandPanel mode={mode} onToggle={toggleMode} />
      </motion.div>
    </div>
  );
}

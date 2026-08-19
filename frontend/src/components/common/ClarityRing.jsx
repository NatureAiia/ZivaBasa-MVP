import { motion } from "framer-motion";

/*
  Signature element: "Ziva" = to know/see clearly (Shona). This ring is the platform's one
  recurring shape — it does three different jobs so it reads as a system, not decoration:
    mode="loading"    — indeterminate spin, shown while a prediction/explanation computes
    mode="confidence" — fills to the model's probability/certainty, color-coded by risk
    mode="static"      — just the glyph, used small in nav/branding contexts
*/
export default function ClarityRing({
  mode = "static",
  value = 0, // 0..1, used when mode="confidence"
  size = 56,
  strokeWidth = 5,
  color = "gold",
  label,
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const colorVar = { gold: "var(--gold)", teal: "var(--teal)", red: "var(--red)", indigo: "var(--indigo)" }[color] || "var(--gold)";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={mode === "loading" ? "animate-spin" : ""} style={{ animationDuration: "1.4s" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--border))"
          strokeWidth={strokeWidth}
        />
        {mode === "confidence" ? (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`rgb(${colorVar})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - value) }}
            transition={{ type: "spring", stiffness: 90, damping: 20 }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`rgb(${colorVar})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={mode === "loading" ? circumference * 0.75 : circumference * 0.4}
          />
        )}
      </svg>
      {label && (
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-ink-muted">
          {label}
        </span>
      )}
    </div>
  );
}

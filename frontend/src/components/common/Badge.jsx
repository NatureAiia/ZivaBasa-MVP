import clsx from "clsx";

const TONES = {
  gold: "bg-gold/10 text-gold border-gold/25",
  teal: "bg-teal/10 text-teal border-teal/25",
  red: "bg-red/10 text-red border-red/25",
  indigo: "bg-indigo/10 text-indigo border-indigo/25",
  neutral: "bg-surface2 text-ink-muted border-border",
};

export default function Badge({ tone = "neutral", children, className }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border uppercase tracking-wide",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

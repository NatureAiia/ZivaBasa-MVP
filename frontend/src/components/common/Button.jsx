import { motion } from "framer-motion";
import clsx from "clsx";
import { magneticHover } from "../../lib/motion";

const VARIANTS = {
  primary: "bg-gold text-bg font-semibold hover:brightness-110",
  secondary: "bg-surface2 text-ink border border-border hover:border-ink-faint",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface2",
  danger: "bg-red/10 text-red border border-red/25 hover:bg-red/15",
};

export default function Button({ variant = "primary", className, children, disabled, ...props }) {
  return (
    <motion.button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none",
        VARIANTS[variant],
        className
      )}
      disabled={disabled}
      variants={magneticHover}
      initial="rest"
      whileHover={disabled ? "rest" : "hover"}
      whileTap={disabled ? "rest" : "tap"}
      {...props}
    >
      {children}
    </motion.button>
  );
}

import { useMemo } from "react";
import { motion } from "framer-motion";

const COLORS = ["var(--gold)", "var(--teal)"];

function randomSparkles(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    top: Math.random() * 100,
    left: Math.random() * 100,
    size: 2 + Math.random() * 4,
    color: COLORS[i % COLORS.length],
    duration: 1.8 + Math.random() * 2.2,
    delay: Math.random() * 3,
  }));
}

// Decorative sparkle field for behind the auth card — purely ambient, no interaction.
export default function GlitterWrap({ count = 36 }) {
  const sparkles = useMemo(() => randomSparkles(count), [count]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {sparkles.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: s.size,
            height: s.size,
            backgroundColor: `rgb(${s.color})`,
            boxShadow: `0 0 ${s.size * 2}px rgb(${s.color} / 0.8)`,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            repeatDelay: Math.random() * 2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

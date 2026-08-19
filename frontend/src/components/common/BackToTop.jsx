import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { useScrollTracking } from "../../lib/scrollTracking";

// Sits at bottom-left so it never collides with ChiedzaWidget's floating chat button
// (bottom-right) or Toast's stack (bottom-right).
export default function BackToTop() {
  const { visible, scrollToTop } = useScrollTracking(400);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          onClick={scrollToTop}
          aria-label="Back to top"
          title="Back to top"
          className="fixed bottom-6 left-6 z-40 w-10 h-10 rounded-full bg-surface border border-border shadow-card dark:shadow-card-dark flex items-center justify-center text-ink-faint hover:text-gold hover:border-gold/40 transition-colors"
        >
          <ArrowUp size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

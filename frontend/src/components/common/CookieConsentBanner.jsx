import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cookie } from "lucide-react";
import Button from "./Button";

const STORAGE_KEY = "zivabasa-cookie-consent";

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  const respond = (value) => {
    localStorage.setItem(STORAGE_KEY, value);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
          className="fixed bottom-0 inset-x-0 z-[150] p-4 flex justify-center"
          role="dialog"
          aria-label="Cookie consent"
        >
          <div className="w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-card dark:shadow-card-dark p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Cookie size={20} className="text-gold shrink-0" />
            <p className="flex-1 text-xs text-ink-muted leading-relaxed">
              We use essential cookies to keep you signed in and remember your preferences (like
              theme). We don&rsquo;t use tracking or advertising cookies.
            </p>
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" className="text-xs px-3 py-1.5" onClick={() => respond("declined")}>
                Decline
              </Button>
              <Button variant="primary" className="text-xs px-3 py-1.5" onClick={() => respond("accepted")}>
                Accept
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

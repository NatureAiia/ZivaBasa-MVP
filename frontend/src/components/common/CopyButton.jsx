import { useState } from "react";
import { Check, Copy } from "lucide-react";
import clsx from "clsx";

export default function CopyButton({ text, label = "Copy", className }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be denied/unavailable (older browsers, insecure context) — the
      // fallback below still lets the user copy manually via the browser's own selection UI.
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={clsx(
        "inline-flex items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-ink transition-colors",
        className
      )}
      aria-label={copied ? "Copied" : label}
    >
      {copied ? <Check size={13} className="text-teal" /> : <Copy size={13} />}
      {copied ? "Copied" : label}
    </button>
  );
}

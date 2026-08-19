import { useEffect, useRef, useState } from "react";

// Most pages scroll an inner div (overflow-y-auto), not the window — the app shell is a fixed
// h-screen flex layout, not a normal document flow. `scroll` events don't bubble, but they DO
// propagate through the capture phase, so a single capture listener on `document` sees scrolling
// from any descendant container as well as the window itself, without each page having to wire
// up its own ref.
export function useScrollTracking(threshold = 300) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const targetRef = useRef(null);

  useEffect(() => {
    const read = (el) => {
      const scrollTop = el === document.documentElement || el === document.body ? window.scrollY : el.scrollTop;
      const scrollHeight = el === document.documentElement || el === document.body ? document.documentElement.scrollHeight : el.scrollHeight;
      const clientHeight = el === document.documentElement || el === document.body ? window.innerHeight : el.clientHeight;
      return { scrollTop, max: scrollHeight - clientHeight };
    };

    const onScroll = (e) => {
      const el = e.target === document ? document.documentElement : e.target;
      const { scrollTop, max } = read(el);
      if (scrollTop <= 0 && max <= 0) return;
      targetRef.current = el;
      setProgress(max > 0 ? Math.min(1, Math.max(0, scrollTop / max)) : 0);
      setVisible(scrollTop > threshold);
    };

    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("scroll", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("scroll", onScroll);
    };
  }, [threshold]);

  const scrollToTop = () => {
    const el = targetRef.current;
    if (el && el !== document.documentElement && el !== document.body) {
      el.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return { progress, visible, scrollToTop };
}

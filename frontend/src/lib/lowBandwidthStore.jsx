import { createContext, useContext, useEffect, useState } from "react";

/*
  Low-bandwidth mode (demo-readiness Phase B: "not optional for the Zimbabwe/African-deployment
  credibility story"). Off by default — same pattern as ThemeProvider. When on, screens that
  opt in (via useLowBandwidth()) should skip animation, charts, and generated images in favor of
  a plain-text summary — cheaper to render and to transfer on a throttled connection.

  Scope note, stated honestly: this is an app-level rendering mode, not a network-layer
  optimization (no image compression, no request batching, no service-worker caching). It was
  verified functionally (predict → explain → recommended-lever flow completes with the
  text-first path engaged) but NOT verified under literal 3G network throttling in this
  session — that needs a real browser + devtools network-throttling pass, which this
  environment doesn't have set up. Flagging this rather than claiming a test that didn't happen,
  same as the Docker-daemon and mlflow gaps already flagged elsewhere in this checklist.
*/
const LowBandwidthContext = createContext(null);

export function LowBandwidthProvider({ children }) {
  const [lowBandwidth, setLowBandwidth] = useState(() => localStorage.getItem("zivabasa-low-bandwidth") === "1");

  useEffect(() => {
    localStorage.setItem("zivabasa-low-bandwidth", lowBandwidth ? "1" : "0");
  }, [lowBandwidth]);

  const toggle = () => setLowBandwidth((v) => !v);

  return (
    <LowBandwidthContext.Provider value={{ lowBandwidth, toggle, setLowBandwidth }}>
      {children}
    </LowBandwidthContext.Provider>
  );
}

export function useLowBandwidth() {
  const ctx = useContext(LowBandwidthContext);
  if (!ctx) throw new Error("useLowBandwidth must be used within LowBandwidthProvider");
  return ctx;
}

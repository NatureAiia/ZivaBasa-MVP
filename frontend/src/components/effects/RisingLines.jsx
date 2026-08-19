import { useEffect, useRef } from "react";

/**
 * RisingLines — thin light trails and soft glow blobs rising from a horizon
 * line. Adapted from the Originkit Framer component: background is
 * transparent (clearRect, not an opaque black fill) so it composites over
 * existing page content, and defaults are tuned to the brand palette at a
 * low, ambient density rather than a full effect showcase.
 */
export default function RisingLines(props) {
  const {
    particles = 140,
    color = "#E7A23A",
    showHorizon = true,
    horizonColor = "#E7A23A",
    riseSpeed: riseSpeedRaw = 18,
    opacity: opacityRaw = 55,
    horizonOpacity: horizonOpacityRaw = 35,
    scale: scaleRaw = 6,
    style,
    className,
  } = props;

  const riseSpeed = riseSpeedRaw / 100;
  const opacity = opacityRaw / 100;
  const horizonOpacity = horizonOpacityRaw / 100;
  const scale = scaleRaw / 2;

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  const parseColor = (input) => {
    if (!input) return [255, 255, 255];
    const s = input.trim();
    if (s.startsWith("#")) {
      let hex = s.slice(1);
      if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
      const num = parseInt(hex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    }
    return [255, 255, 255];
  };

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cParticle = parseColor(color);
    const cHorizon = parseColor(horizonColor);
    const defaultScale = 3.5;
    const worldScale = Math.max(0.1, scale) / defaultScale;

    const makeRng = (seed) => {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const rng = makeRng(0xc0ffee);

    let particleCount = 0;
    let pX = new Float32Array(0), pY = new Float32Array(0), pVY = new Float32Array(0);
    let pHeight = new Float32Array(0);
    let blobCount = 0;
    let bX = new Float32Array(0), bY = new Float32Array(0), bVY = new Float32Array(0), bR = new Float32Array(0);

    const sampleCenterX = (w) => ((rng() + rng() + rng()) / 3) * w;
    const sampleSparkHeight = () => {
      let tall;
      if (rng() < 0.12) tall = 70 + rng() * 30;
      else tall = 20 + Math.pow(rng(), 0.7) * 35;
      return Math.max(1, Math.floor(tall * worldScale));
    };
    const getHorizonY = (h) => h - 1;

    const initParticles = () => {
      const { w, h } = sizeRef.current;
      const area = w * h;
      const refArea = 800 * 400;
      const target = Math.max(0, Math.floor((particles * area) / refArea));
      particleCount = Math.min(target, 2000);
      pX = new Float32Array(particleCount);
      pY = new Float32Array(particleCount);
      pVY = new Float32Array(particleCount);
      pHeight = new Float32Array(particleCount);

      const horizonY = getHorizonY(h);
      for (let i = 0; i < particleCount; i++) {
        pX[i] = sampleCenterX(w);
        pY[i] = horizonY - rng() * horizonY * 0.95;
        pVY[i] = 10 + rng() * 40;
        pHeight[i] = sampleSparkHeight();
      }

      const blobTarget = Math.max(0, Math.floor(target * 0.3));
      blobCount = Math.min(blobTarget, 600);
      bX = new Float32Array(blobCount);
      bY = new Float32Array(blobCount);
      bVY = new Float32Array(blobCount);
      bR = new Float32Array(blobCount);
      for (let i = 0; i < blobCount; i++) {
        bX[i] = sampleCenterX(w);
        bY[i] = horizonY - rng() * horizonY * 0.95;
        bVY[i] = 8 + rng() * 28;
        bR[i] = (1.5 + Math.pow(rng(), 1.8) * 3.5) * worldScale;
      }
    };

    const resize = (entry) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cr = entry?.contentRect;
      const rectW = cr?.width || container.clientWidth || container.getBoundingClientRect().width;
      const rectH = cr?.height || container.clientHeight || container.getBoundingClientRect().height;
      const w = Math.max(1, Math.floor(rectW) || 800);
      const h = Math.max(1, Math.floor(rectH) || 300);
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles();
    };

    resize();
    const ro = new ResizeObserver((entries) => resize(entries[0]));
    ro.observe(container);

    const drawFrame = (deltaSec) => {
      const { w, h } = sizeRef.current;
      const dt = Math.max(0.001, Math.min(0.05, deltaSec));
      const horizonY = getHorizonY(h);

      // Transparent background — composites over existing page content
      // instead of the original opaque-black fill.
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      const horizonAlpha = Math.max(0, Math.min(1, horizonOpacity));
      if (showHorizon && horizonAlpha > 0.001) {
        const rx = w * 0.5;
        const ry = 40 * worldScale;
        ctx.save();
        ctx.translate(w / 2, horizonY);
        ctx.scale(rx / ry, 1);
        const hGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
        hGrad.addColorStop(0, `rgba(${cHorizon[0]},${cHorizon[1]},${cHorizon[2]},${horizonAlpha})`);
        hGrad.addColorStop(0.35, `rgba(${cHorizon[0]},${cHorizon[1]},${cHorizon[2]},${horizonAlpha * 0.65})`);
        hGrad.addColorStop(0.7, `rgba(${cHorizon[0]},${cHorizon[1]},${cHorizon[2]},${horizonAlpha * 0.2})`);
        hGrad.addColorStop(1, `rgba(${cHorizon[0]},${cHorizon[1]},${cHorizon[2]},0)`);
        ctx.fillStyle = hGrad;
        ctx.fillRect(-ry - 2, -ry - 2, (ry + 2) * 2, (ry + 2) * 2);
        ctx.restore();
      }

      const riseSpeedMul = Math.max(0, riseSpeed) * 10;
      const denom = Math.max(1, horizonY);

      for (let i = 0; i < blobCount; i++) {
        const effVy = bVY[i] * (1.0 + riseSpeedMul);
        bY[i] -= effVy * dt;
        if (bY[i] < -bR[i] * 2) {
          bX[i] = sampleCenterX(w);
          bY[i] = horizonY - rng() * 10;
          bVY[i] = 8 + rng() * 28;
          bR[i] = (1.5 + Math.pow(rng(), 1.8) * 3.5) * worldScale;
        }
        const t = Math.max(0, Math.min(1, (horizonY - bY[i]) / denom));
        const fade = t < 0.2 ? t / 0.2 : Math.max(0, 1 - (t - 0.2) / 0.8);
        const a = fade * opacity;
        if (a < 0.01) continue;

        const cx = bX[i], cy = bY[i], r = bR[i];
        const aClamped = Math.min(1, a);
        const bGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        bGrad.addColorStop(0, `rgba(${cParticle[0]},${cParticle[1]},${cParticle[2]},${aClamped})`);
        bGrad.addColorStop(0.4, `rgba(${cParticle[0]},${cParticle[1]},${cParticle[2]},${aClamped * 0.45})`);
        bGrad.addColorStop(1, `rgba(${cParticle[0]},${cParticle[1]},${cParticle[2]},0)`);
        ctx.fillStyle = bGrad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        if (r > 2.5) {
          ctx.fillStyle = `rgba(255,255,255,${aClamped})`;
          ctx.fillRect(Math.floor(cx), Math.floor(cy), 1, 1);
        }
      }

      for (let i = 0; i < particleCount; i++) {
        const effVy = pVY[i] * (1.0 + riseSpeedMul);
        pY[i] -= effVy * dt;
        if (pY[i] < -pHeight[i]) {
          pX[i] = sampleCenterX(w);
          pY[i] = horizonY - rng() * 10;
          pVY[i] = 10 + rng() * 40;
          pHeight[i] = sampleSparkHeight();
        }
        const t = Math.max(0, Math.min(1, (horizonY - pY[i]) / denom));
        const fade = t < 0.2 ? t / 0.2 : Math.max(0, 1 - (t - 0.2) / 0.8);
        const a = fade * opacity;
        if (a < 0.01) continue;

        const px = Math.floor(pX[i]);
        const py = Math.floor(pY[i]);
        const lineHeight = pHeight[i];
        const aClamped = Math.min(1, a);
        const sGrad = ctx.createLinearGradient(0, py, 0, py + lineHeight);
        sGrad.addColorStop(0, `rgba(${cParticle[0]},${cParticle[1]},${cParticle[2]},0)`);
        sGrad.addColorStop(0.7, `rgba(${cParticle[0]},${cParticle[1]},${cParticle[2]},${aClamped})`);
        sGrad.addColorStop(1, `rgba(${cParticle[0]},${cParticle[1]},${cParticle[2]},${aClamped})`);
        ctx.fillStyle = sGrad;
        ctx.fillRect(px, py, 1, lineHeight);
      }
    };

    let lastT = performance.now();
    const loop = (t) => {
      const deltaSec = (t - lastT) / 1000;
      lastT = t;
      drawFrame(deltaSec);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [particles, color, showHorizon, horizonColor, riseSpeed, opacity, horizonOpacity, scale]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", minWidth: 100, minHeight: 60, overflow: "hidden", ...style }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

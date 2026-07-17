import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ThemeToggle from "../components/layout/ThemeToggle";
import GlitterWrap from "../components/effects/GlitterWrap";
import Globe from "../components/landing/Globe";

// All custom properties below are prefixed --land- so they can never collide with the app-wide
// design tokens in index.css (which Tailwind's rgb(var(--x)) utilities read from `:root`) even
// though this stylesheet is scoped under .landing-page, not :root itself.
const LANDING_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&display=swap');

.landing-page {
  --land-bg: #0A0B0D;
  --land-bg-soft: #101216;
  --land-surface: #15171C;
  --land-surface-2: #1B1E24;
  --land-ink: #F3EEE3;
  --land-ink-muted: #A39C8C;
  --land-ink-faint: #6E6A5F;
  --land-hairline: rgba(243,238,227,0.10);
  --land-hairline-strong: rgba(243,238,227,0.18);
  --land-gold: #E7A23A;
  --land-gold-dim: #B77E2C;
  --land-gold-wash: rgba(231,162,58,0.12);
  --land-ember: #C24A2B;
  --land-font-display: 'Fraunces', serif;
  --land-font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --land-font-mono: 'IBM Plex Mono', monospace;
  --land-container: 1180px;

  background: var(--land-bg);
  color: var(--land-ink);
  font-family: var(--land-font-body);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
  min-height: 100vh;
}
:root[data-theme="light"] .landing-page {
  --land-bg: #FAF7F2;
  --land-bg-soft: #F3EEE5;
  --land-surface: #FFFFFF;
  --land-surface-2: #F0EAE0;
  --land-ink: #1A1712;
  --land-ink-muted: #5C5648;
  --land-ink-faint: #8C8574;
  --land-hairline: rgba(26,23,18,0.08);
  --land-hairline-strong: rgba(26,23,18,0.14);
  --land-gold: #B9791F;
  --land-gold-dim: #8F5D18;
  --land-gold-wash: rgba(185,121,31,0.10);
  --land-ember: #A83D22;
}

.landing-page *{ box-sizing: border-box; margin: 0; padding: 0; }
.landing-page img, .landing-page svg{ display:block; max-width:100%; }
.landing-page a{ color: inherit; text-decoration: none; }
.landing-page :focus-visible{ outline: 2px solid var(--land-gold); outline-offset: 3px; }

.landing-page .wrap{
  width: 100%;
  max-width: var(--land-container);
  margin: 0 auto;
  padding: 0 20px;
}

.landing-page .eyebrow{
  font-family: var(--land-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--land-gold);
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.landing-page .eyebrow::before{
  content:"";
  width: 16px;
  height: 1px;
  background: var(--land-gold);
  display: inline-block;
}

/* ---------- NAV ---------- */
.landing-page header{
  position: sticky;
  top: 0;
  z-index: 50;
  background: color-mix(in srgb, var(--land-bg) 82%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--land-hairline);
}
.landing-page .nav{
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
}
.landing-page .brand{
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--land-font-display);
  font-weight: 600;
  font-size: 1.15rem;
  letter-spacing: 0.01em;
}
.landing-page .brand-mark{ width: 26px; height: 26px; flex-shrink: 0; }
.landing-page .nav-links{
  display: none;
  align-items: center;
  gap: 32px;
  font-size: 0.9rem;
  color: var(--land-ink-muted);
}
.landing-page .nav-links a{ transition: color .2s ease; }
.landing-page .nav-links a:hover{ color: var(--land-ink); }

.landing-page .nav-actions{ display: flex; align-items: center; gap: 10px; }

.landing-page .btn{
  font-family: var(--land-font-body);
  font-size: 0.88rem;
  font-weight: 600;
  padding: 10px 18px;
  border-radius: 3px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all .2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
}
.landing-page .btn-ghost{ color: var(--land-ink); border-color: var(--land-hairline-strong); background: transparent; }
.landing-page .btn-ghost:hover{ border-color: var(--land-gold); color: var(--land-gold); }
.landing-page .btn-solid{ background: var(--land-gold); color: #1A1204; }
.landing-page .btn-solid:hover{ filter: brightness(1.08); }
.landing-page .btn-block{ width: 100%; }

.landing-page .nav-actions .btn-ghost{ display:none; }

.landing-page .hamburger{
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  cursor: pointer;
}
.landing-page .hamburger span{ display:block; height: 1.5px; background: var(--land-ink); transition: all .25s ease; }
.landing-page .hamburger span:nth-child(1){ width: 22px; }
.landing-page .hamburger span:nth-child(2){ width: 16px; margin-left: auto; }
.landing-page .hamburger span:nth-child(3){ width: 22px; }
.landing-page .hamburger.open span:nth-child(1){ transform: translateY(6.5px) rotate(45deg); width: 22px; }
.landing-page .hamburger.open span:nth-child(2){ opacity: 0; }
.landing-page .hamburger.open span:nth-child(3){ transform: translateY(-6.5px) rotate(-45deg); width: 22px; }

.landing-page .mobile-menu{ max-height: 0; overflow: hidden; transition: max-height .3s ease; border-bottom: 1px solid transparent; }
.landing-page .mobile-menu.open{ max-height: 420px; border-bottom: 1px solid var(--land-hairline); }
.landing-page .mobile-menu-inner{ padding: 8px 0 24px; display: flex; flex-direction: column; gap: 4px; }
.landing-page .mobile-menu-inner a{ padding: 12px 0; border-bottom: 1px solid var(--land-hairline); color: var(--land-ink-muted); font-size: 0.95rem; }
.landing-page .mobile-menu-inner .mm-actions{ display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.landing-page .mobile-menu-inner .mm-theme{ display: flex; justify-content: center; padding: 10px 0 0; }

/* ---------- HERO ---------- */
.landing-page .hero{ position: relative; padding: 56px 0 64px; overflow: hidden; }
.landing-page .hero-glow{
  position: absolute;
  top: -10%;
  left: 50%;
  transform: translateX(-50%);
  width: 900px;
  height: 900px;
  max-width: 220vw;
  background: radial-gradient(circle, rgba(231,162,58,0.22) 0%, rgba(231,162,58,0.07) 32%, rgba(231,162,58,0) 62%);
  pointer-events: none;
  animation: landingPulse 7s ease-in-out infinite;
}
.landing-page .hero-glitter{ position: absolute; inset: 0; pointer-events: none; opacity: 0.65; }
@keyframes landingPulse{
  0%, 100% { opacity: 0.75; transform: translateX(-50%) scale(1); }
  50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
}
@media (prefers-reduced-motion: reduce){ .landing-page .hero-glow{ animation: none; } }
.landing-page .hero-burst{ position: absolute; top: -60px; right: -140px; width: 460px; opacity: 0.9; }
.landing-page .hero-inner{ position: relative; z-index: 1; }
.landing-page .hero h1{
  font-family: var(--land-font-display);
  font-weight: 500;
  font-size: clamp(2.3rem, 8vw, 4.2rem);
  line-height: 1.06;
  letter-spacing: -0.01em;
  margin: 18px 0 22px;
  max-width: 14ch;
}
.landing-page .hero h1 em{ font-style: italic; color: var(--land-gold); font-weight: 400; }
.landing-page .hero p.lead{ font-size: 1.05rem; color: var(--land-ink-muted); max-width: 46ch; margin-bottom: 32px; }
.landing-page .hero-ctas{ display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 18px; }
.landing-page .hero-ctas .btn{ padding: 13px 24px; font-size: 0.92rem; }
.landing-page .hero-note{ font-family: var(--land-font-mono); font-size: 0.74rem; color: var(--land-ink-faint); letter-spacing: 0.02em; }

.landing-page .hero-stats{
  margin-top: 56px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  border-top: 1px solid var(--land-hairline);
  padding-top: 24px;
}
.landing-page .hero-stat .num{ font-family: var(--land-font-display); font-size: 1.5rem; color: var(--land-gold); }
.landing-page .hero-stat .label{ font-size: 0.8rem; color: var(--land-ink-muted); margin-top: 2px; }

/* ---------- SECTION SHARED ---------- */
.landing-page section{ padding: 64px 0; position: relative; }
.landing-page .section-head{ max-width: 640px; margin-bottom: 40px; }
.landing-page .section-head h2{
  font-family: var(--land-font-display);
  font-weight: 500;
  font-size: clamp(1.7rem, 5vw, 2.5rem);
  line-height: 1.15;
  margin-top: 16px;
}

/* ---------- QUESTION ---------- */
.landing-page .question{ background: var(--land-bg-soft); border-top: 1px solid var(--land-hairline); border-bottom: 1px solid var(--land-hairline); }
.landing-page .question blockquote{
  font-family: var(--land-font-display);
  font-style: italic;
  font-size: clamp(1.6rem, 6vw, 2.6rem);
  font-weight: 400;
  line-height: 1.2;
  color: var(--land-ink);
  margin: 18px 0 24px;
  max-width: 16ch;
}
.landing-page .question .body-copy{ color: var(--land-ink-muted); max-width: 58ch; margin-bottom: 40px; }
.landing-page .problem-grid{ display: grid; grid-template-columns: 1fr; gap: 1px; background: var(--land-hairline); border: 1px solid var(--land-hairline); }
.landing-page .problem-card{ background: var(--land-bg-soft); padding: 26px 24px; transition: background .25s ease, transform .25s ease; }
.landing-page .problem-card:hover{ background: var(--land-surface-2); transform: translateY(-2px); }
.landing-page .problem-card .tag{ font-family: var(--land-font-mono); font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--land-ember); }
.landing-page .problem-card h3{ font-family: var(--land-font-display); font-weight: 500; font-size: 1.15rem; margin: 10px 0 8px; }
.landing-page .problem-card p{ color: var(--land-ink-muted); font-size: 0.92rem; }

/* ---------- HOW IT WORKS ---------- */
.landing-page .steps{ display: grid; grid-template-columns: 1fr; gap: 0; }
.landing-page .step{ display: grid; grid-template-columns: 56px 1fr; gap: 20px; padding: 28px 0; border-top: 1px solid var(--land-hairline); }
.landing-page .step:last-child{ border-bottom: 1px solid var(--land-hairline); }
.landing-page .step .idx{ font-family: var(--land-font-mono); font-size: 0.85rem; color: var(--land-gold); padding-top: 4px; }
.landing-page .step h3{ font-family: var(--land-font-display); font-weight: 500; font-size: 1.3rem; margin-bottom: 8px; }
.landing-page .step p{ color: var(--land-ink-muted); max-width: 56ch; }

/* ---------- CONTRIBUTIONS ---------- */
.landing-page .contrib-grid{ display: grid; grid-template-columns: 1fr; gap: 1px; background: var(--land-hairline); border: 1px solid var(--land-hairline); }
.landing-page .contrib-card{ background: var(--land-bg); padding: 26px 24px; position: relative; transition: background .25s ease, transform .25s ease; }
.landing-page .contrib-card:hover{ background: var(--land-bg-soft); transform: translateY(-2px); }
.landing-page .contrib-card .tag{ position: relative; z-index: 1; font-family: var(--land-font-mono); font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--land-gold); }
.landing-page .contrib-card h3{ font-family: var(--land-font-display); font-weight: 500; font-size: 1.1rem; margin: 10px 0 8px; }
.landing-page .contrib-card p{ color: var(--land-ink-muted); font-size: 0.9rem; }

/* ---------- ECOSYSTEM ---------- */
.landing-page .eco-grid{ display: grid; grid-template-columns: 1fr; gap: 14px; }
.landing-page .eco-card{
  background: var(--land-surface);
  border: 1px solid var(--land-hairline-strong);
  border-radius: 4px;
  padding: 26px 22px;
  position: relative;
  overflow: hidden;
  transition: border-color .25s ease, transform .25s ease, box-shadow .25s ease;
}
.landing-page .eco-card:hover{ border-color: var(--land-gold-dim); transform: translateY(-3px); box-shadow: 0 16px 40px -20px rgba(231,162,58,0.35); }
.landing-page .eco-card.flagship{ border-color: var(--land-gold-dim); }
.landing-page .eco-card.flagship::before{
  content:"";
  position: absolute;
  top: 0; right: 0;
  width: 220px; height: 220px;
  background: radial-gradient(circle, var(--land-gold-wash) 0%, transparent 70%);
  pointer-events: none;
}
.landing-page .eco-head{ display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.landing-page .eco-head h3{ font-family: var(--land-font-display); font-size: 1.4rem; font-weight: 500; }
.landing-page .eco-head .translit{ font-family: var(--land-font-mono); font-size: 0.72rem; color: var(--land-ink-faint); }
.landing-page .eco-focus{ font-family: var(--land-font-mono); font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--land-ember); margin-bottom: 10px; display: block; }
.landing-page .eco-card p.desc{ color: var(--land-ink-muted); font-size: 0.9rem; margin-bottom: 16px; }
.landing-page .badge{ font-family: var(--land-font-mono); font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 12px; border-radius: 100px; display: inline-block; }
.landing-page .badge-live{ background: var(--land-gold-wash); color: var(--land-gold); border: 1px solid var(--land-gold-dim); }
.landing-page .badge-planned{ background: transparent; color: var(--land-ink-faint); border: 1px solid var(--land-hairline-strong); }
.landing-page .pill-row{ display: flex; flex-wrap: wrap; gap: 10px; }
.landing-page .pill{ font-family: var(--land-font-mono); font-size: 0.72rem; letter-spacing: 0.05em; text-transform: uppercase; padding: 7px 14px; border: 1px solid var(--land-hairline-strong); border-radius: 100px; color: var(--land-ink-muted); }

/* ---------- AMBIENT BLOBS ---------- */
.landing-page .ambient-blob{ position: absolute; border-radius: 50%; filter: blur(60px); pointer-events: none; z-index: 0; opacity: 0.55; animation: landingDrift 18s ease-in-out infinite; }
.landing-page .ambient-blob.gold{ background: radial-gradient(circle, rgba(231,162,58,0.30) 0%, rgba(231,162,58,0) 70%); }
.landing-page .ambient-blob.ember{ background: radial-gradient(circle, rgba(194,74,43,0.24) 0%, rgba(194,74,43,0) 70%); animation-duration: 22s; animation-direction: reverse; }
@keyframes landingDrift{ 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-4%, 5%) scale(1.08); } }
@media (prefers-reduced-motion: reduce){ .landing-page .ambient-blob{ animation: none; } }

/* ---------- GLOBE ---------- */
.landing-page .globe-frame{ position: relative; }
.landing-page .globe-tag{
  position: absolute;
  left: 50%;
  bottom: -14px;
  transform: translateX(-50%);
  font-family: var(--land-font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--land-ink-muted);
  background: var(--land-surface);
  border: 1px solid var(--land-hairline-strong);
  padding: 6px 14px;
  border-radius: 100px;
  white-space: nowrap;
  z-index: 2;
}
.landing-page .globe-tag b{ color: var(--land-gold); font-weight: 500; }
.landing-page .mini-trend{
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 22px 0 24px;
  padding: 16px 18px;
  border: 1px solid var(--land-hairline);
  border-radius: 6px;
  background: var(--land-bg-soft);
}
.landing-page .mini-trend svg{ flex-shrink: 0; }
.landing-page .mini-trend-copy .num{ font-family: var(--land-font-display); font-size: 1.4rem; color: var(--land-gold); line-height: 1; }
.landing-page .mini-trend-copy .label{ font-family: var(--land-font-mono); font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--land-ink-faint); margin-top: 4px; }
.landing-page .trend-path{ stroke-dasharray: 220; stroke-dashoffset: 220; animation: landingDrawTrend 2.4s ease forwards 0.3s; }
@keyframes landingDrawTrend{ to{ stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce){ .landing-page .trend-path{ animation: none; stroke-dashoffset: 0; } }

.landing-page .globe-row{ display: grid; grid-template-columns: 1fr; gap: 32px; align-items: center; }
.landing-page .globe-copy p{ color: var(--land-ink-muted); max-width: 52ch; margin-bottom: 20px; }
.landing-page .globe-wrap{
  position: relative;
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1 / 1;
  margin: 0 auto 22px;
  border-radius: 50%;
  overflow: hidden;
  background: radial-gradient(circle at 35% 30%, rgba(231,162,58,0.08), transparent 65%);
  cursor: grab;
}
.landing-page .globe-fallback{
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--land-font-mono);
  font-size: 0.7rem;
  color: var(--land-ink-faint);
  text-align: center;
  padding: 20px;
}

/* ---------- TRUST STRIP ---------- */
.landing-page .trust-strip{ border-top: 1px solid var(--land-hairline); border-bottom: 1px solid var(--land-hairline); padding: 22px 0; background: var(--land-bg-soft); }
.landing-page .trust-strip .wrap{ display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: center; font-family: var(--land-font-mono); font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--land-ink-faint); }
.landing-page .trust-strip span.item{ display: flex; align-items: center; gap: 8px; }
.landing-page .trust-strip span.item::before{ content:""; width: 5px; height: 5px; border-radius: 50%; background: var(--land-gold); display: inline-block; flex-shrink: 0; }

/* ---------- PRINCIPLES ---------- */
.landing-page .principles{ background: var(--land-bg-soft); border-top: 1px solid var(--land-hairline); border-bottom: 1px solid var(--land-hairline); }
.landing-page .principle-list{ display: grid; grid-template-columns: 1fr; gap: 24px; }
.landing-page .principle{ display: flex; gap: 14px; align-items: flex-start; }
.landing-page .principle .dot{ width: 7px; height: 7px; border-radius: 50%; background: var(--land-gold); margin-top: 8px; flex-shrink: 0; }
.landing-page .principle h4{ font-family: var(--land-font-body); font-weight: 600; font-size: 0.98rem; margin-bottom: 4px; }
.landing-page .principle p{ color: var(--land-ink-muted); font-size: 0.9rem; }
.landing-page .principles-foot{ margin-top: 40px; font-family: var(--land-font-mono); font-size: 0.75rem; color: var(--land-ink-faint); border-top: 1px solid var(--land-hairline); padding-top: 20px; }

/* ---------- AUTH CTA ---------- */
.landing-page .auth-section{ padding: 72px 0 84px; }
.landing-page .auth-grid{ display: grid; grid-template-columns: 1fr; gap: 40px; align-items: start; }
.landing-page .auth-copy h2{ font-family: var(--land-font-display); font-weight: 500; font-size: clamp(1.7rem, 5vw, 2.3rem); margin: 16px 0 14px; line-height: 1.15; }
.landing-page .auth-copy p{ color: var(--land-ink-muted); max-width: 46ch; margin-bottom: 20px; }
.landing-page .auth-copy ul{ list-style:none; display:flex; flex-direction:column; gap:10px; }
.landing-page .auth-copy li{ font-size: 0.88rem; color: var(--land-ink-muted); display:flex; gap:10px; align-items:flex-start; }
.landing-page .auth-copy li::before{ content:"✓"; color: var(--land-gold); flex-shrink: 0; }

.landing-page .auth-card{
  background: var(--land-surface);
  border: 1px solid var(--land-hairline-strong);
  border-radius: 6px;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.landing-page .auth-card p{ color: var(--land-ink-muted); font-size: 0.9rem; }
.landing-page .auth-card .auth-card-actions{ display: flex; flex-direction: column; gap: 10px; }

/* ---------- FOOTER ---------- */
.landing-page footer{ border-top: 1px solid var(--land-hairline); padding: 40px 0 28px; }
.landing-page .footer-grid{ display: grid; grid-template-columns: 1fr; gap: 32px; margin-bottom: 32px; }
.landing-page .footer-brand p{ color: var(--land-ink-muted); font-size: 0.85rem; margin-top: 12px; max-width: 36ch; }
.landing-page .footer-cols{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
.landing-page .footer-col h5{ font-family: var(--land-font-mono); font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--land-ink-faint); margin-bottom: 14px; }
.landing-page .footer-col ul{ list-style: none; display: flex; flex-direction: column; gap: 10px; }
.landing-page .footer-col a{ color: var(--land-ink-muted); font-size: 0.88rem; }
.landing-page .footer-col a:hover{ color: var(--land-gold); }
.landing-page .footer-bottom{ display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--land-hairline); padding-top: 20px; font-size: 0.78rem; color: var(--land-ink-faint); }

/* ---------- BREAKPOINTS ---------- */
@media (min-width: 640px){
  .landing-page .problem-grid{ grid-template-columns: repeat(3, 1fr); }
  .landing-page .hero-stats{ grid-template-columns: repeat(3, 1fr); }
  .landing-page .footer-cols{ grid-template-columns: repeat(3, 1fr); }
  .landing-page .principle-list{ grid-template-columns: repeat(2, 1fr); }
  .landing-page .contrib-grid{ grid-template-columns: repeat(2, 1fr); }
  .landing-page .eco-grid{ grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 860px){
  .landing-page .nav-links{ display: flex; }
  .landing-page .hamburger{ display: none; }
  .landing-page .mobile-menu{ display: none; }
  .landing-page .nav-actions .btn-ghost{ display: inline-flex; }
  .landing-page .step{ grid-template-columns: 90px 1fr; }
  .landing-page .auth-grid{ grid-template-columns: 1fr 1fr; gap: 64px; }
  .landing-page .footer-grid{ grid-template-columns: 1.2fr 2fr; }
  .landing-page .globe-row{ grid-template-columns: 1.1fr 0.9fr; gap: 48px; }
}
@media (min-width: 1024px){
  .landing-page .hero-inner{ max-width: 640px; }
  .landing-page .steps{ max-width: 760px; }
  .landing-page .contrib-grid{ grid-template-columns: repeat(3, 1fr); }
  .landing-page .eco-grid{ grid-template-columns: repeat(4, 1fr); }
}
`;

const MODULES = [
  {
    slug: "zivabasa",
    name: "ZivaBasa",
    translit: "ziva (know) · basa (work)",
    focus: "Jobs, employment, productivity & skills",
    desc: "Forecasts how AI and digital transformation affect workforce structure, job displacement, job creation, productivity and skills demand.",
    live: true,
  },
  {
    slug: "ziva-dzidzo",
    name: "ZivaDzidzo",
    focus: "Education",
    desc: "Forecasts how AI and digital transformation affect learning outcomes, teacher roles, student performance, curriculum needs and future skills.",
    live: false,
  },
  {
    slug: "ziva-business",
    name: "ZivaBusiness",
    focus: "Revenue, profit & customers",
    desc: "Forecasts how AI and digital transformation affect company performance, customer behaviour, revenue growth, profitability and operating efficiency.",
    live: false,
  },
  {
    slug: "ziva-upfumi",
    name: "ZivaUpfumi",
    focus: "Economy, GDP & informal market",
    desc: "Forecasts how AI and digital transformation affect GDP, informal markets, productivity, employment, financial inclusion and sector growth.",
    live: false,
  },
];

function BrandMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 26 26" fill="none">
      <circle cx="13" cy="13" r="3.2" fill="#E7A23A" />
      <g stroke="#E7A23A" strokeWidth="1.1" strokeLinecap="round">
        <line x1="13" y1="1" x2="13" y2="6.2" />
        <line x1="13" y1="19.8" x2="13" y2="25" />
        <line x1="1" y1="13" x2="6.2" y2="13" />
        <line x1="19.8" y1="13" x2="25" y2="13" />
        <line x1="4.2" y1="4.2" x2="7.9" y2="7.9" />
        <line x1="18.1" y1="18.1" x2="21.8" y2="21.8" />
        <line x1="21.8" y1="4.2" x2="18.1" y2="7.9" />
        <line x1="7.9" y1="18.1" x2="4.2" y2="21.8" />
      </g>
    </svg>
  );
}

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#ecosystem", label: "Ecosystem" },
  { href: "#contributions", label: "Contributions" },
];

export default function Landing() {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.title = "ChiedzaAI — Clarity for AI-driven transformation";
  }, []);

  return (
    <div className="landing-page">
      <style>{LANDING_CSS}</style>

      <header>
        <nav className="wrap nav">
          <a href="#top" className="brand">
            <BrandMark className="brand-mark" />
            ChiedzaAI
          </a>

          <div className="nav-links">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
          </div>

          <div className="nav-actions">
            <ThemeToggle />
            <Link to="/login" className="btn btn-ghost">Sign in</Link>
            <Link to="/login?mode=signup" className="btn btn-solid">Create account</Link>
            <button
              className={`hamburger${mobileOpen ? " open" : ""}`}
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
              aria-controls="mobileMenu"
              onClick={() => setMobileOpen((o) => !o)}
            >
              <span></span><span></span><span></span>
            </button>
          </div>
        </nav>

        <div className={`mobile-menu${mobileOpen ? " open" : ""}`} id="mobileMenu">
          <div className="wrap mobile-menu-inner" onClick={() => setMobileOpen(false)}>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
            <div className="mm-actions">
              <Link to="/login" className="btn btn-ghost btn-block">Sign in</Link>
              <Link to="/login?mode=signup" className="btn btn-solid btn-block">Create account</Link>
            </div>
            <div className="mm-theme">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="hero">
          <div className="hero-glow" aria-hidden="true"></div>
          <div className="hero-glitter" aria-hidden="true">
            <GlitterWrap
              particleCount={160}
              color1="#F3EEE3"
              color2="#E7A23A"
              color3="#C24A2B"
              speed={1.4}
              density={55}
              starSize={4}
              focalDepth={9}
              turbulence={0.6}
              brightness={42}
              glitterIntensity={2.5}
              trailAmount={94}
              reverse={false}
            />
          </div>
          <svg className="hero-burst" aria-hidden="true" viewBox="0 0 400 400" fill="none">
            <g stroke="#E7A23A" strokeLinecap="round">
              <line x1="200" y1="200" x2="200" y2="40" strokeWidth="1" opacity="0.5" />
              <line x1="200" y1="200" x2="200" y2="330" strokeWidth="1" opacity="0.35" />
              <line x1="200" y1="200" x2="60" y2="200" strokeWidth="1" opacity="0.3" />
              <line x1="200" y1="200" x2="340" y2="200" strokeWidth="1" opacity="0.45" />
              <line x1="200" y1="200" x2="100" y2="100" strokeWidth="1" opacity="0.4" />
              <line x1="200" y1="200" x2="300" y2="100" strokeWidth="1" opacity="0.55" />
              <line x1="200" y1="200" x2="300" y2="300" strokeWidth="1" opacity="0.25" />
              <line x1="200" y1="200" x2="100" y2="300" strokeWidth="1" opacity="0.3" />
              <line x1="200" y1="200" x2="255" y2="60" strokeWidth="0.6" opacity="0.3" />
              <line x1="200" y1="200" x2="145" y2="60" strokeWidth="0.6" opacity="0.2" />
              <line x1="200" y1="200" x2="340" y2="140" strokeWidth="0.6" opacity="0.28" />
              <line x1="200" y1="200" x2="60" y2="260" strokeWidth="0.6" opacity="0.2" />
            </g>
            <circle cx="200" cy="200" r="46" fill="url(#landingHeroGlow)" />
            <circle cx="200" cy="200" r="4.5" fill="#F3EEE3" />
            <circle cx="300" cy="100" r="2.4" fill="#E7A23A" />
            <circle cx="340" cy="200" r="2" fill="#E7A23A" opacity="0.7" />
            <circle cx="100" cy="300" r="2" fill="#E7A23A" opacity="0.5" />
            <defs>
              <radialGradient id="landingHeroGlow" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="#E7A23A" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#E7A23A" stopOpacity="0" />
              </radialGradient>
            </defs>
          </svg>

          <div className="wrap hero-inner">
            <span className="eyebrow">Chiedza — Shona for light</span>
            <h1>Clarity for <em>AI-driven</em> transformation.</h1>
            <p className="lead">
              ChiedzaAI is an explainable AI decision-support platform that forecasts how AI and
              digital transformation reshape jobs, education, business and the economy — starting
              with ZivaBasa, for Zimbabwe&rsquo;s banking workforce.
            </p>
            <div className="hero-ctas">
              <Link to="/login?mode=signup" className="btn btn-solid">Create account</Link>
              <Link to="/login" className="btn btn-ghost">Sign in</Link>
            </div>
            <p className="hero-note">INPUTS · DEEP LEARNING · EXPLAINABLE AI · WORKFORCE OUTPUTS — a four-layer, policy-ready model</p>

            <div className="hero-stats">
              <div className="hero-stat">
                <div className="num">4</div>
                <div className="label">Modules planned across the ChiedzaAI ecosystem</div>
              </div>
              <div className="hero-stat">
                <div className="num">1</div>
                <div className="label">Explainable multi-task architecture, not disconnected tools</div>
              </div>
              <div className="hero-stat">
                <div className="num">ZW</div>
                <div className="label">First evidence base for Zimbabwe&rsquo;s banking workforce</div>
              </div>
            </div>
          </div>
        </section>

        {/* QUESTION */}
        <section className="question">
          <div className="wrap">
            <span className="eyebrow">The problem</span>
            <blockquote>&ldquo;Will there still be a job for me?&rdquo;</blockquote>
            <p className="body-copy">
              That question follows AI into every boardroom, bank and government office.
              Institutions are being asked to make workforce decisions in the dark — without
              reliable datasets, forecasting tools or explainable evidence for what AI adoption
              actually does to jobs, skills and productivity.
            </p>

            <div className="problem-grid">
              <div className="problem-card">
                <span className="tag">Problem 01</span>
                <h3>Unknown employment structure</h3>
                <p>Jobs and skills disruption from AI and digital transformation is happening without institutions being able to see or measure it.</p>
              </div>
              <div className="problem-card">
                <span className="tag">Problem 02</span>
                <h3>Absence of decision-support tools</h3>
                <p>Automation risk, skills demand and productivity shifts have no shared tool that turns them into a decision a leader can act on.</p>
              </div>
              <div className="problem-card">
                <span className="tag">Problem 03</span>
                <h3>Limited datasets and evidence</h3>
                <p>Very little reliable evidence exists on how AI adoption is actually changing Zimbabwean and African workforces.</p>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">How it works</span>
              <h2>A four-layer, policy-ready model.</h2>
            </div>

            <div className="steps">
              <div className="step">
                <div className="idx">01</div>
                <div>
                  <h3>AI &amp; digital transformation inputs</h3>
                  <p>Banking HR, productivity, digital-transformation and AI-adoption data — from raw system records to survey and secondary data — feed the pipeline.</p>
                </div>
              </div>
              <div className="step">
                <div className="idx">02</div>
                <div>
                  <h3>Deep learning</h3>
                  <p>A multi-task neural network processes the inputs jointly, rather than training three separate models for employment, skills and productivity.</p>
                </div>
              </div>
              <div className="step">
                <div className="idx">03</div>
                <div>
                  <h3>Explainable AI</h3>
                  <p>A causal-consistent XAI layer turns each prediction into reasoning that can be understood, challenged and defended — not a black box.</p>
                </div>
              </div>
              <div className="step">
                <div className="idx">04</div>
                <div>
                  <h3>Workforce outputs</h3>
                  <p>Decision-support outputs for reskilling, staffing, productivity planning, regulation and responsible AI adoption.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CONTRIBUTIONS */}
        <section id="contributions">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Contributions</span>
              <h2>What ChiedzaAI adds that existing tools don&rsquo;t.</h2>
            </div>

            <div className="contrib-grid">
              <div className="contrib-card">
                <span className="tag">01</span>
                <h3>Explainable multi-task DL framework</h3>
                <p>Jointly predicts employment, productivity and workforce skills impacts in one architecture.</p>
              </div>
              <div className="contrib-card">
                <span className="tag">02</span>
                <h3>Causal-consistent XAI layer</h3>
                <p>Improves transparency, interpretation and policy defensibility beyond standard correlation-based explanations.</p>
              </div>
              <div className="contrib-card">
                <span className="tag">03</span>
                <h3>Privacy-preserving bank collaboration</h3>
                <p>Enables federated learning across institutions without exposing sensitive data.</p>
              </div>
              <div className="contrib-card">
                <span className="tag">04</span>
                <h3>Four-layer policy-ready model</h3>
                <p>Links AI &amp; digital-transformation inputs, deep learning processing, XAI and workforce outputs into one pipeline.</p>
              </div>
              <div className="contrib-card">
                <span className="tag">05</span>
                <h3>Decision-support toolkit</h3>
                <p>Supports reskilling, productivity planning, regulation and responsible AI adoption — not prediction alone.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ECOSYSTEM */}
        <section id="ecosystem">
          <div className="ambient-blob gold" style={{ width: 420, height: 420, top: -120, right: -100 }} aria-hidden="true"></div>
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">The ecosystem</span>
              <h2>Four modules. One question: what does AI mean for us?</h2>
            </div>

            <div className="eco-grid">
              {MODULES.map((m) => (
                <div key={m.slug} className={`eco-card${m.live ? " flagship" : ""}`}>
                  <span className={`badge ${m.live ? "badge-live" : "badge-planned"}`}>
                    {m.live ? "MVP focus" : "Planned"}
                  </span>
                  <div className="eco-head" style={{ marginTop: 14 }}>
                    <h3>{m.name}</h3>
                    {m.translit && <span className="translit">{m.translit}</span>}
                  </div>
                  <span className="eco-focus">{m.focus}</span>
                  <p className="desc">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* GLOBAL REACH */}
        <section id="global-reach">
          <div className="ambient-blob ember" style={{ width: 380, height: 380, bottom: -140, left: -120 }} aria-hidden="true"></div>
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Global context</span>
              <h2>Built in Zimbabwe. Built for a question every economy is asking.</h2>
            </div>

            <div className="globe-row">
              <div className="globe-copy">
                <p>
                  Africa risks consuming foreign AI while exporting its data, its digital value and
                  its future jobs. ChiedzaAI starts in Harare, mapping how AI and digital
                  transformation reshape Zimbabwe&rsquo;s banking workforce first — evidence built
                  locally, built to hold up anywhere the same question is being asked.
                </p>

                <div className="mini-trend" aria-hidden="true">
                  <svg width="96" height="40" viewBox="0 0 96 40" fill="none">
                    <path className="trend-path" d="M2 32 C 16 30, 22 20, 32 22 C 44 24, 46 10, 58 12 C 70 14, 74 4, 94 3" stroke="#E7A23A" strokeWidth="2" strokeLinecap="round" fill="none" />
                    <circle cx="94" cy="3" r="3" fill="#E7A23A" />
                  </svg>
                  <div className="mini-trend-copy">
                    <div className="num">2026 – 2030</div>
                    <div className="label">Projected AI-adoption trajectory, Zimbabwe banking sector</div>
                  </div>
                </div>

                <div className="pill-row">
                  <span className="pill">Harare, Zimbabwe</span>
                  <span className="pill">Zimbabwe National AI Strategy 2026–2030</span>
                </div>
              </div>
              <div className="globe-frame">
                <Globe />
                <span className="globe-tag">17.83°S · <b>Harare</b></span>
              </div>
            </div>
          </div>
        </section>

        {/* SIGNIFICANCE */}
        <section id="principles" className="principles">
          <div className="ambient-blob gold" style={{ width: 340, height: 340, top: "10%", right: -100 }} aria-hidden="true"></div>
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Significance</span>
              <h2>Why it matters.</h2>
            </div>

            <div className="principle-list">
              <div className="principle">
                <span className="dot"></span>
                <div>
                  <h4>First explainable evidence base</h4>
                  <p>Maps AI and digital-transformation impact on Zimbabwe&rsquo;s banking workforce.</p>
                </div>
              </div>
              <div className="principle">
                <span className="dot"></span>
                <div>
                  <h4>Employment and skills insight</h4>
                  <p>Supports analysis of workforce change in the digital economy.</p>
                </div>
              </div>
              <div className="principle">
                <span className="dot"></span>
                <div>
                  <h4>Workforce planning support</h4>
                  <p>Guides reskilling, upskilling and human-capability planning.</p>
                </div>
              </div>
              <div className="principle">
                <span className="dot"></span>
                <div>
                  <h4>Productivity and profitability value</h4>
                  <p>Helps banks improve efficiency and manage HR-related costs.</p>
                </div>
              </div>
              <div className="principle">
                <span className="dot"></span>
                <div>
                  <h4>Policy and regulatory decision support</h4>
                  <p>Provides scenario analysis for employment, productivity and skills planning.</p>
                </div>
              </div>
            </div>

            <p className="principles-foot">ALIGNED WITH THE ZIMBABWE NATIONAL AI STRATEGY 2026–2030 — PILLAR 1 (AI TALENT &amp; CAPACITY) AND PILLAR 3 (AI ADOPTION &amp; SERVICE TRANSFORMATION)</p>
          </div>
        </section>

        {/* TRUST STRIP */}
        <div className="trust-strip">
          <div className="wrap">
            <span className="item">Explainable by default</span>
            <span className="item">Privacy-preserving federated learning</span>
            <span className="item">Human-in-the-loop, never automatic decisions</span>
            <span className="item">Locally grounded for Zimbabwe &amp; Africa</span>
          </div>
        </div>

        {/* AUTH CTA */}
        <section className="auth-section" id="auth">
          <div className="wrap auth-grid">
            <div className="auth-copy">
              <span className="eyebrow">Get started</span>
              <h2>Bring your workforce data into the light.</h2>
              <p>
                Create an account to explore ZivaBasa, the first module of the ChiedzaAI
                ecosystem, with sample banking-sector workforce data — or sign in if you already
                have access.
              </p>
              <ul>
                <li>Explore forecasts on proxy datasets before connecting your own</li>
                <li>See explanations alongside every prediction, not after it</li>
                <li>No commitment — this is a working preview, not a sales form</li>
              </ul>
            </div>

            <div className="auth-card">
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Ready when you are</div>
                <p>Sign in to your account, or create one in under a minute.</p>
              </div>
              <div className="auth-card-actions">
                <Link to="/login" className="btn btn-solid btn-block">Sign in</Link>
                <Link to="/login?mode=signup" className="btn btn-ghost btn-block">Create account</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="footer-grid">
            <div className="footer-brand">
              <a href="#top" className="brand">
                <BrandMark className="brand-mark" />
                ChiedzaAI
              </a>
              <p>An explainable AI decision-support platform for jobs, skills and productivity in the age of AI — starting with ZivaBasa.</p>
            </div>

            <div className="footer-cols">
              <div className="footer-col">
                <h5>Platform</h5>
                <ul>
                  <li><a href="#how-it-works">How it works</a></li>
                  <li><a href="#contributions">Contributions</a></li>
                  <li><a href="#ecosystem">Ecosystem</a></li>
                  <li><a href="#global-reach">Global reach</a></li>
                  <li><a href="#principles">Significance</a></li>
                </ul>
              </div>
              <div className="footer-col">
                <h5>Account</h5>
                <ul>
                  <li><Link to="/login">Sign in</Link></li>
                  <li><Link to="/login?mode=signup">Create account</Link></li>
                </ul>
              </div>
              <div className="footer-col">
                <h5>Company</h5>
                <ul>
                  <li><a href="#top">Built by RUBIEM Developers</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <span>© 2026 ChiedzaAI. Part of the Aiia ecosystem. All forecasts shown are for demonstration purposes.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

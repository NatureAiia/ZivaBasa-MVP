/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        surface2: "rgb(var(--surface-2) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-muted": "rgb(var(--ink-muted) / <alpha-value>)",
        "ink-faint": "rgb(var(--ink-faint) / <alpha-value>)",
        gold: "rgb(var(--gold) / <alpha-value>)",
        teal: "rgb(var(--teal) / <alpha-value>)",
        red: "rgb(var(--red) / <alpha-value>)",
        indigo: "rgb(var(--indigo) / <alpha-value>)",
        violet: "rgb(var(--violet) / <alpha-value>)",
        cyan: "rgb(var(--cyan) / <alpha-value>)",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
        /* Authority serif — reserved for the one deliberate "signature" moment per screen:
           report titles, the landing headline, hero stat figures. Never body copy, never UI
           chrome. Restraint is the point; overuse turns it into just another display font. */
        serif: ["Fraunces", "'Iowan Old Style'", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 1px 12px rgb(0 0 0 / 0.03)",
        "card-dark": "0 1px 2px rgb(0 0 0 / 0.3), 0 4px 24px rgb(0 0 0 / 0.25)",
        glow: "0 0 0 1px rgb(var(--gold) / 0.25), 0 0 24px rgb(var(--gold) / 0.15)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s linear infinite",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "spring-soft": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm mineral ground — never pure black
        ink: {
          DEFAULT: "var(--ink)",
          deep: "var(--ink-deep)",
          raised: "var(--ink-raised)",
          graphite: "var(--ink-graphite)",
          graphite2: "var(--ink-graphite-2)",
        },
        // Warm paper — never pure white
        paper: {
          DEFAULT: "var(--paper)",
          raised: "var(--paper-raised)",
          sunk: "var(--paper-sunk)",
        },
        // Amber — focus, priority, the golden-hour accent
        amber: {
          DEFAULT: "var(--amber)",
          rich: "var(--amber-rich)",
          deep: "var(--amber-deep)",
          pale: "var(--amber-pale)",
        },
        // Sage — growth, done, live states (muted, never neon)
        sage: {
          DEFAULT: "var(--sage)",
          deep: "var(--sage-deep)",
          pale: "var(--sage-pale)",
        },
        clay: "var(--clay)", // warnings only, used sparingly
        // Neutral text tiers
        head: "var(--text-head)",
        body: "var(--text-body)",
        muted: "var(--text-muted)",
        faint: "var(--text-faint)",
        hairline: "var(--hairline)",
        "hairline-strong": "var(--hairline-strong)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        eyebrow: "0.2em",
      },
      borderRadius: {
        xs: "2px",
        sm: "4px",
        md: "6px",
        lg: "8px",
      },
      maxWidth: {
        section: "1320px",
      },
      transitionTimingFunction: {
        // Refined easing — no bounce, no dated cubic
        ks: "cubic-bezier(0.22, 1, 0.36, 1)",
        ksout: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        aurora: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22,1,0.36,1) forwards",
        marquee: "marquee 40s linear infinite",
        shimmer: "shimmer 2.4s linear infinite",
        "spin-slow": "spin-slow 14s linear infinite",
        aurora: "aurora 18s ease infinite",
      },
    },
  },
  plugins: [],
};

export default config;

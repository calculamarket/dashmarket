import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // Tokens semânticos legados — mapeados para CSS vars (sem quebrar o código existente)
        ink:   "var(--fg)",
        paper: "var(--surface-warm)",
        moss:  "var(--success)",
        sea:   "var(--accent)",
        clay:  "var(--warn)",
        berry: "var(--danger)",
        // Tokens novos — iguais ao dashmarket-pro
        crt:          "var(--crt)",
        "crt-2":      "var(--crt-deep)",
        phos:         "var(--phosphor)",
        muted:        "var(--phosphor-soft)",
        faint:        "var(--phosphor-muted)",
        rule:         "var(--rule)",
        "rule-strong":"var(--rule-strong)",
        hazard:       "var(--danger)",
        signal:       "var(--success)",
        accent:       "var(--accent)"
      },
      fontFamily: {
        display: ["Archivo Black", "sans-serif"],
        sans:    ["Inter", "system-ui", "sans-serif"],
        mono:    ["JetBrains Mono", "IBM Plex Mono", "ui-monospace", "monospace"],
        body:    ["Inter", "system-ui", "sans-serif"],
        data:    ["Fira Code", "JetBrains Mono", "ui-monospace", "monospace"]
      },
      borderRadius: {
        panel: "var(--radius-panel, 18px)",
        pill:  "9999px"
      },
      boxShadow: {
        soft:         "var(--shadow-soft)",
        card:         "var(--shadow-card)",
        "card-hover": "0 4px 16px rgba(79,140,255,.15), 0 1px 4px rgba(0,0,0,.08)",
        kpi:          "0 0 0 1px rgba(79,140,255,.08), 0 8px 32px rgba(79,140,255,.12)"
      },
      animation: {
        blink:  "blink 1s steps(1) infinite",
        pulse2: "pulse2 1.6s steps(1) infinite",
        live:   "live 1.6s steps(1) infinite"
      },
      keyframes: {
        blink:  { "50%": { opacity: "0.15" } },
        pulse2: { "50%": { opacity: "0.3" } },
        live:   { "50%": { opacity: "0.3", boxShadow: "0 0 0 transparent" } }
      }
    }
  },
  plugins: []
};

export default config;

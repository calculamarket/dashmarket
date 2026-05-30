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
        ink: "#102033",
        paper: "#eef6ff",
        moss: "#22c55e",
        sea: "#4f8cff",
        clay: "#f59e0b",
        berry: "#ef4444"
      },
      boxShadow: {
        soft: "0 24px 80px rgba(79, 140, 255, 0.18)",
        card: "0 1px 3px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.06)",
        "card-hover": "0 4px 16px rgba(79,140,255,.15), 0 1px 4px rgba(0,0,0,.08)",
        kpi: "0 0 0 1px rgba(79,140,255,.08), 0 8px 32px rgba(79,140,255,.12)"
      }
    }
  },
  plugins: []
};

export default config;

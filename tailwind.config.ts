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
        ink: "#17211f",
        paper: "#f7f4ec",
        moss: "#4a6f54",
        sea: "#0f766e",
        clay: "#b45309",
        berry: "#9f1239"
      },
      boxShadow: {
        soft: "0 20px 50px rgba(23, 33, 31, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;

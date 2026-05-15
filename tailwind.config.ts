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
        ink: "#ececea",
        paper: "#0b0b0b",
        moss: "#4af626",
        sea: "#e61919",
        clay: "#e0a819",
        berry: "#e61919"
      },
      boxShadow: {
        soft: "none"
      }
    }
  },
  plugins: []
};

export default config;

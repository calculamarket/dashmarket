"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type ThemeName = "dark" | "light";

type ThemeToggleProps = {
  className?: string;
  collapseLabelOnLarge?: boolean;
};

const STORAGE_KEY = "dashmarket-theme";

function readStoredTheme(): ThemeName {
  if (typeof window === "undefined") return "dark";

  try {
    return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The theme still changes for the current session if storage is unavailable.
  }
}

export function ThemeToggle({
  className = "",
  collapseLabelOnLarge = false
}: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeName>("dark");

  useEffect(() => {
    const storedTheme = readStoredTheme();
    document.documentElement.dataset.theme = storedTheme;
    setTheme(storedTheme);
  }, []);

  const isLight = theme === "light";
  const Icon = isLight ? Sun : Moon;
  const label = isLight ? "Claro" : "Escuro";

  function toggleTheme() {
    const nextTheme = isLight ? "dark" : "light";
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button
      aria-checked={isLight}
      aria-label={`Tema ${label.toLowerCase()}`}
      className={`inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/20 ${className}`}
      onClick={toggleTheme}
      role="switch"
      title={`Tema ${label.toLowerCase()}`}
      type="button"
    >
      <Icon aria-hidden className="h-4 w-4 shrink-0" />
      <span className={collapseLabelOnLarge ? "lg:hidden" : ""}>{label}</span>
      <span
        aria-hidden
        className="relative h-5 w-9 rounded-full border border-white/20 bg-black/15"
      >
        <span
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-[var(--phosphor)] transition-transform ${
            isLight ? "translate-x-[1.15rem]" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}

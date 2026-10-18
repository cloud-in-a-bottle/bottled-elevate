import { createRoot, createSignal } from "solid-js";

export type Theme = "dark" | "light";
const KEY = "elevate.theme";

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // storage unavailable
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

const store = createRoot(() => {
  const [theme, setThemeSignal] = createSignal<Theme>(initial());
  document.documentElement.dataset.theme = theme();
  return { theme, setThemeSignal };
});

export const theme = store.theme;

export function setTheme(t: Theme): void {
  store.setThemeSignal(t);
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // storage unavailable
  }
}

export const toggleTheme = () => setTheme(theme() === "dark" ? "light" : "dark");

/** Resolve a CSS custom property (eg "--text") to its current value. */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

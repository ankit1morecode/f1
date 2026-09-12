import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "slipstreamx.theme.v1";
const listeners = new Set<() => void>();

let current: Theme = "light";

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(theme: Theme) {
  current = theme;
  apply(theme);
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable — keep in-memory theme */
  }
  for (const l of listeners) l();
}

export function toggleTheme() {
  setTheme(current === "dark" ? "light" : "dark");
}

function stored(): Theme {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Light on the first render so server and client markup agree, then adopt the stored choice. */
export function useTheme(): Theme {
  const [theme, setLocal] = useState<Theme>("light");
  useEffect(() => {
    const initial = stored();
    current = initial;
    apply(initial);
    setLocal(initial);
    const cb = () => setLocal(getTheme());
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return theme;
}

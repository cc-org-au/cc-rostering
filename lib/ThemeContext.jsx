"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

export const THEME_STORAGE_KEY = "cc-rostering-theme";

const ThemeContext = createContext({
  mode: "light",
  setMode: () => {},
});

/** Inline script string for layout: applies theme class before paint. */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var v=localStorage.getItem(k);var d=document.documentElement;if(v==='dark')d.classList.add('dark');else if(v==='light')d.classList.remove('dark');else if(window.matchMedia('(prefers-color-scheme: dark)').matches)d.classList.add('dark');}catch(e){}})();`;

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState("light");

  useLayoutEffect(() => {
    let m = "light";
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "dark" || stored === "light") {
        m = stored;
      } else {
        m = document.documentElement.classList.contains("dark")
          ? "dark"
          : "light";
      }
    } catch {
      m = document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";
    }
    setModeState(m);
    document.documentElement.classList.toggle("dark", m === "dark");
  }, []);

  const setMode = useCallback((next) => {
    const m = next === "dark" ? "dark" : "light";
    setModeState(m);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
    document.documentElement.classList.toggle("dark", m === "dark");
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

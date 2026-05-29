"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Owns the canonical theme state. On mount it reconciles state with the value
 * the bootstrap script already wrote to `data-theme` (re-deriving from
 * localStorage / `prefers-color-scheme` as a fallback), then exposes
 * `useTheme()` so consumers never read the DOM directly. Pre-paint flash is
 * mitigated by `themeBootstrapScript` injected from `layout.tsx`.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    // The bootstrap script already set `data-theme` synchronously, but re-run
    // the resolution in case of edge cases (e.g., navigation back/forward) and
    // sync React state to the resolved value.
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem("playground.theme") : null;
    let resolved: Theme;
    if (stored === "light" || stored === "dark") {
      resolved = stored;
    } else {
      resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", resolved);
    setThemeState(resolved);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("playground.theme", next);
    } catch {
      // ignore quota/security errors — toggle still works in-session
    }
    setThemeState(next);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

/**
 * Reads the canonical theme owned by {@link ThemeProvider}. Throws if used
 * outside the provider so misuse surfaces immediately.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Tiny inline script injected before hydration to prevent a flash of the
 * wrong theme. Reads localStorage and OS preference and sets the attribute
 * before React paints.
 */
export const themeBootstrapScript = `
(function(){try{var t=localStorage.getItem('playground.theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();
`;

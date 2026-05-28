"use client";

import { useEffect } from "react";

/**
 * Reads `playground.theme` from localStorage on mount, falls back to
 * `prefers-color-scheme`. Sets `data-theme` on <html>. Pre-paint flash is
 * mitigated by `themeBootstrapScript` injected from `layout.tsx`.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Defensive — the bootstrap script already did this synchronously, but
    // re-run in case of edge cases (e.g., navigation back/forward).
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem("playground.theme") : null;
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
      return;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
  }, []);

  return <>{children}</>;
}

/**
 * Tiny inline script injected before hydration to prevent a flash of the
 * wrong theme. Reads localStorage and OS preference and sets the attribute
 * before React paints.
 */
export const themeBootstrapScript = `
(function(){try{var t=localStorage.getItem('playground.theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();
`;

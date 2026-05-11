import type { ReactNode } from "react";

/**
 * Code strip — visible only when a Cell's view mode is `code` (§ 5.3).
 * For the visual demo we accept a `children` slot of pre-rendered HTML or
 * text. No syntax highlighting library — keep this purely visual until
 * bw-0dw.16 wires a real engine.
 */
export function CodeStrip({ children }: { children: ReactNode }) {
  return (
    <pre
      data-testid="code-strip"
      style={{
        margin: 0,
        padding: "12px 16px",
        background: "var(--color-surface-alt)",
        borderTop: "1px solid var(--color-border)",
        fontFamily:
          "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
        fontSize: "var(--size-13-5)",
        fontWeight: 400,
        lineHeight: 1.55,
        color: "var(--color-text)",
        overflowX: "auto",
      }}
    >
      {children}
    </pre>
  );
}

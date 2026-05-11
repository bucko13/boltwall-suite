import type { ReactNode } from "react";

export type CaveatPillState = "matched" | "unsatisfied" | "rejected";

const STATE_BG: Record<CaveatPillState, string> = {
  matched: "var(--color-accent-soft)",
  unsatisfied: "var(--color-surface-alt)",
  rejected: "var(--color-danger-soft)",
};

const STATE_TEXT: Record<CaveatPillState, string> = {
  matched: "var(--color-accent)",
  unsatisfied: "var(--color-dim)",
  rejected: "var(--color-danger)",
};

export function CaveatPill({
  state = "unsatisfied",
  children,
}: {
  state?: CaveatPillState;
  children: ReactNode;
}) {
  return (
    <span
      data-testid="caveat-pill"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: "var(--size-12)",
        fontFamily:
          "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
        fontWeight: 500,
        background: STATE_BG[state],
        color: STATE_TEXT[state],
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

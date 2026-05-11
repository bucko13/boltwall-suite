import type { ReactNode } from "react";

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      data-testid="chip"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        background: "var(--color-surface-alt)",
        color: "var(--color-dim)",
        fontSize: "var(--size-11)",
        fontWeight: 500,
        letterSpacing: 0.2,
      }}
    >
      {children}
    </span>
  );
}

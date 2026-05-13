import type { CSSProperties } from "react";

export function panelInputStyle(error = false): CSSProperties {
  return {
    padding: "7px 10px",
    background: "var(--color-surface)",
    border: `1px solid ${error ? "var(--color-danger)" : "var(--color-primary)"}`,
    borderRadius: 4,
    fontSize: "var(--size-13)",
    color: "var(--color-text)",
    fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
  };
}

export function panelTextareaStyle(error = false): CSSProperties {
  return {
    ...panelInputStyle(error),
    fontSize: "var(--size-12-5)",
    resize: "vertical",
  };
}

export function panelOutputStyle(): CSSProperties {
  return {
    padding: "10px 12px",
    background: "var(--color-surface-alt)",
    border: "1px solid var(--color-border)",
    boxShadow: "inset 3px 0 0 var(--color-accent)",
    borderRadius: 4,
  };
}

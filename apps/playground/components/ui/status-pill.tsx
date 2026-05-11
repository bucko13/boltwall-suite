import type { CSSProperties, ReactNode } from "react";

export type StatusPillState =
  | "idle"
  | "ready"
  | "running"
  | "pass"
  | "fail"
  | "warn";

const STATE_STYLES: Record<StatusPillState, CSSProperties> = {
  idle: {
    background: "var(--color-surface-alt)",
    color: "var(--color-dim)",
  },
  ready: {
    background: "var(--color-surface-alt)",
    color: "var(--color-text)",
  },
  running: {
    background: "var(--color-surface-alt)",
    color: "var(--color-primary)",
  },
  pass: {
    background: "var(--color-accent-soft)",
    color: "var(--color-accent)",
  },
  fail: {
    background: "var(--color-danger-soft)",
    color: "var(--color-danger)",
  },
  warn: {
    background: "var(--color-warn-soft)",
    color: "var(--color-warn)",
  },
};

export function StatusPill({
  state,
  children,
}: {
  state: StatusPillState;
  children: ReactNode;
}) {
  return (
    <span
      data-testid="status-pill"
      data-state={state}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: "var(--size-11)",
        fontWeight: 500,
        lineHeight: 1.5,
        ...STATE_STYLES[state],
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: "currentColor",
          opacity: 0.85,
        }}
      />
      {children}
    </span>
  );
}

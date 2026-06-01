"use client";

import { useId, useState } from "react";
import type { CSSProperties, FocusEvent, ReactNode } from "react";

export type StatusPillState = "idle" | "ready" | "running" | "pass" | "fail" | "warn";

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
  details,
}: {
  state: StatusPillState;
  children: ReactNode;
  details?: string | null;
}) {
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const trimmedDetails = details?.trim() ?? "";
  const hasDetails = trimmedDetails.length > 0;
  const label = typeof children === "string" ? children : "status";
  const copyText = `Playground ${label} detail:\n\n${trimmedDetails}`;

  function handleBlur(event: FocusEvent<HTMLSpanElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setOpen(false);
  }

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(`${copyText}\n\nPage: ${window.location.href}`);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <span
      onMouseEnter={hasDetails ? () => setOpen(true) : undefined}
      onMouseLeave={hasDetails ? () => setOpen(false) : undefined}
      onFocus={hasDetails ? () => setOpen(true) : undefined}
      onBlur={hasDetails ? handleBlur : undefined}
      style={{
        display: "inline-flex",
        position: "relative",
      }}
    >
      <span
        data-testid="status-pill"
        data-state={state}
        tabIndex={hasDetails ? 0 : undefined}
        role={hasDetails ? "button" : undefined}
        aria-describedby={hasDetails && open ? detailsId : undefined}
        aria-expanded={hasDetails ? open : undefined}
        title={hasDetails ? trimmedDetails : undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 8px",
          borderRadius: 999,
          fontSize: "var(--size-11)",
          fontWeight: 500,
          lineHeight: 1.5,
          // Keep multi-word labels (e.g. "partially verified") on one line so a
          // status change never wraps the pill or reflows the header row.
          whiteSpace: "nowrap",
          cursor: hasDetails ? "help" : "default",
          outlineOffset: 2,
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
      {hasDetails && open ? (
        <>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              zIndex: 29,
              width: "min(340px, calc(100vw - 48px))",
              height: 8,
            }}
          />
          <span
            id={detailsId}
            data-testid="status-pill-details"
            role="tooltip"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              zIndex: 30,
              display: "flex",
              width: "min(340px, calc(100vw - 48px))",
              flexDirection: "column",
              gap: 8,
              padding: 10,
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              background: "var(--color-surface)",
              color: "var(--color-text)",
              boxShadow: "0 12px 28px rgba(0, 0, 0, 0.18)",
              fontSize: "var(--size-12)",
              lineHeight: 1.45,
              whiteSpace: "normal",
            }}
          >
            <span
              style={{
                color: "var(--color-dim)",
                fontSize: "var(--size-11)",
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              Error detail
            </span>
            <span style={{ userSelect: "text" }}>{trimmedDetails}</span>
            <button
              type="button"
              onClick={copyDetails}
              data-testid="status-pill-copy"
              style={{
                alignSelf: "flex-start",
                padding: "4px 8px",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
                background: "var(--color-surface-alt)",
                color: "var(--color-text)",
                cursor: "pointer",
                fontSize: "var(--size-12)",
              }}
            >
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Copy failed"
                  : "Copy detail"}
            </button>
          </span>
        </>
      ) : null}
    </span>
  );
}

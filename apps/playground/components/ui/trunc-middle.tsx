"use client";

import { useState } from "react";

/**
 * Renders a fixed-width identifier as `<first-6>…<last-6>` with a
 * hover/focus tooltip showing the full value. The tooltip is also a
 * click-to-copy target (§ 9.4).
 */
export function TruncMiddle({
  value,
  head = 6,
  tail = 6,
}: {
  value: string;
  head?: number;
  tail?: number;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  const collapsed =
    value.length > head + tail + 1
      ? `${value.slice(0, head)}…${value.slice(-tail)}`
      : value;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <span
      data-testid="trunc-middle"
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      <button
        type="button"
        onClick={copy}
        title={value}
        style={{
          fontFamily:
            "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
          fontSize: "var(--size-12-5)",
          color: "var(--color-text)",
          letterSpacing: 0,
          padding: 0,
          background: "transparent",
        }}
      >
        {collapsed}
      </button>
      {show ? (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 20,
            padding: "6px 8px",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            fontFamily:
              "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
            fontSize: "var(--size-12)",
            color: "var(--color-text)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {copied ? "copied" : value}
        </span>
      ) : null}
    </span>
  );
}

"use client";

import { useState } from "react";

/**
 * Renders a long mono value with copy and expand/wrap controls.
 * This is the visual demo of `big-blob.copy`, `big-blob.toggle`, and
 * `big-blob.wrap` from § 9.
 */
export function BigBlob({
  value,
  defaultExpanded = true,
  wrapDefault = true,
}: {
  value: string;
  defaultExpanded?: boolean;
  wrapDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [wrap, setWrap] = useState(wrapDefault);
  const [copied, setCopied] = useState(false);

  const tooLong = value.length > 512;
  const collapsedView =
    tooLong && !expanded
      ? `${value.slice(0, 40)}…${value.slice(-8)}`
      : value;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore — surface is non-functional in the demo
    }
  }

  return (
    <div data-testid="big-blob" style={{ position: "relative" }}>
      <pre
        style={{
          margin: 0,
          padding: "12px 56px 12px 12px",
          background: "var(--color-surface-alt)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          fontFamily:
            "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
          fontSize: "var(--size-13-5)",
          fontWeight: 400,
          lineHeight: 1.55,
          color: "var(--color-text)",
          overflowWrap: wrap ? "anywhere" : "normal",
          wordBreak: wrap ? "break-all" : "normal",
          whiteSpace: wrap ? "pre-wrap" : "pre",
          overflowX: wrap ? "visible" : "auto",
        }}
      >
        {collapsedView}
      </pre>
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "inline-flex",
          gap: 4,
        }}
      >
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy value"}
          style={{
            padding: "2px 8px",
            fontSize: "var(--size-11)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            color: copied ? "var(--color-accent)" : "var(--color-dim)",
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 6,
          fontSize: "var(--size-11)",
          color: "var(--color-dim)",
        }}
      >
        {tooLong ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{ color: "var(--color-dim)", textDecoration: "underline" }}
          >
            {expanded ? "[collapse]" : "[show full]"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setWrap((v) => !v)}
          style={{ color: "var(--color-dim)", textDecoration: "underline" }}
        >
          wrap: {wrap ? "on" : "off"}
        </button>
        <span style={{ marginLeft: "auto" }}>{value.length} chars</span>
      </div>
    </div>
  );
}

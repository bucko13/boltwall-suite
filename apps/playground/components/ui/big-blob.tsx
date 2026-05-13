"use client";

import { useState } from "react";

/**
 * Renders a long mono value with copy and expand/wrap controls.
 * This is the visual demo of `big-blob.copy`, `big-blob.toggle`, and
 * `big-blob.wrap` from § 9.
 */
export function BigBlob({
  value,
  label = "Generated value",
  defaultExpanded = true,
  wrapDefault = true,
}: {
  value: string;
  label?: string;
  defaultExpanded?: boolean;
  wrapDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [wrap, setWrap] = useState(wrapDefault);
  const [copied, setCopied] = useState(false);

  const tooLong = value.length > 512;
  const collapsedView = tooLong && !expanded ? `${value.slice(0, 40)}…${value.slice(-8)}` : value;

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
    <div
      data-testid="big-blob"
      role="group"
      aria-label={label}
      style={{
        background: "var(--color-surface-alt)",
        border: "1px solid var(--color-border)",
        boxShadow: "inset 3px 0 0 var(--color-accent)",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
          padding: "7px 12px 7px 14px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <span
          data-testid="big-blob-label"
          style={{
            fontSize: "var(--size-11)",
            color: "var(--color-dim)",
            fontFamily:
              "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
          }}
        >
          {label}
        </span>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: "var(--size-11)",
            color: "var(--color-dim)",
          }}
        >
          <span>{value.length} chars</span>
          {tooLong ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{ color: "var(--color-dim)", textDecoration: "underline" }}
            >
              {expanded ? "collapse" : "show full"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setWrap((v) => !v)}
            style={{ color: "var(--color-dim)", textDecoration: "underline" }}
          >
            wrap {wrap ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={copy}
            data-testid="big-blob-copy"
            aria-label={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
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
      </div>
      <pre
        style={{
          margin: 0,
          padding: "12px 14px",
          background: "var(--color-surface-alt)",
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
    </div>
  );
}

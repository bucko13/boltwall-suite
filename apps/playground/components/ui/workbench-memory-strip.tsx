"use client";

import { useState } from "react";

import { useWorkbenchMemory } from "../../lib/url-state";

function truncMiddle(value: string, head = 8, tail = 8) {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function CopyGlyph({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <path d="m3 8 3 3 7-7" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    >
      <rect x="5" y="3" width="8" height="10" rx="1.5" />
      <path d="M3 5.5V12a1 1 0 0 0 1 1h6.5" />
    </svg>
  );
}

function MemoryChip({
  label,
  value,
  onClear,
  testId,
}: {
  label: string;
  value: string;
  onClear: () => void;
  testId: string;
}) {
  const hasValue = value.length > 0;
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    if (!hasValue) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span
      data-testid={testId}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 24,
        padding: "3px 7px",
        borderRadius: 4,
        border: "1px solid var(--color-border)",
        background: hasValue ? "var(--color-accent-soft)" : "var(--color-surface)",
        color: hasValue ? "var(--color-accent)" : "var(--color-dim)",
        fontFamily:
          "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
        fontSize: "var(--size-11)",
        maxWidth: "100%",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}: {hasValue ? truncMiddle(value) : "empty"}
      </span>
      {hasValue ? (
        <>
          <button
            type="button"
            onClick={copyValue}
            data-testid={`${testId}-copy`}
            aria-label={copied ? `Copied remembered ${label}` : `Copy remembered ${label}`}
            title={copied ? "Copied" : "Copy"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 18,
              padding: 0,
              borderRadius: 3,
              color: "var(--color-accent)",
              border: "1px solid color-mix(in srgb, var(--color-accent) 45%, transparent)",
              background: "var(--color-surface)",
              boxSizing: "border-box",
              flexShrink: 0,
            }}
          >
            <CopyGlyph copied={copied} />
          </button>
          <button
            type="button"
            onClick={onClear}
            data-testid={`${testId}-clear`}
            aria-label={`Clear remembered ${label}`}
            style={{
              padding: "0 4px",
              borderRadius: 3,
              color: "var(--color-accent)",
              border: "1px solid color-mix(in srgb, var(--color-accent) 45%, transparent)",
              background: "var(--color-surface)",
              fontSize: "var(--size-10)",
              lineHeight: 1.4,
              whiteSpace: "nowrap",
            }}
          >
            clear
          </button>
        </>
      ) : null}
    </span>
  );
}

export function WorkbenchMemoryStrip() {
  const memory = useWorkbenchMemory();
  if (!memory) return null;

  return (
    <div
      data-testid="workbench-memory-strip"
      style={{
        maxWidth: 860,
        margin: "16px auto 0",
        padding: "0 24px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "start",
          gap: 10,
          padding: "8px 10px",
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          background: "var(--color-surface-alt)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: "var(--size-11)",
              color: "var(--color-dim)",
              fontWeight: 600,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Workbench memory
          </span>
          <MemoryChip
            label="signing key"
            value={memory.signingKey}
            onClear={() => memory.setSigningKey(null)}
            testId="workbench-memory-key"
          />
          <MemoryChip
            label="macaroon"
            value={memory.macaroon}
            onClear={() => memory.setMacaroon(null)}
            testId="workbench-memory-macaroon"
          />
          <MemoryChip
            label="challenge"
            value={memory.challenge}
            onClear={() => memory.setChallenge(null)}
            testId="workbench-memory-challenge"
          />
          <MemoryChip
            label="credential"
            value={memory.credential}
            onClear={() => memory.setCredential(null)}
            testId="workbench-memory-credential"
          />
        </div>

        {memory.signingKey || memory.macaroon || memory.challenge || memory.credential ? (
          <button
            type="button"
            onClick={memory.clear}
            data-testid="workbench-memory-clear-all"
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-dim)",
              fontSize: "var(--size-11)",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  );
}

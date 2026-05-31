"use client";

import { type FocusEvent, useRef, useState } from "react";

import { useWorkbenchMemory } from "../../lib/url-state";

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

function ClearGlyph() {
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
      strokeWidth="1.6"
    >
      <path d="m4 4 8 8" />
      <path d="m12 4-8 8" />
    </svg>
  );
}

function RevealGlyph() {
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
      <path d="M1.8 8s2.2-4 6.2-4 6.2 4 6.2 4-2.2 4-6.2 4-6.2-4-6.2-4Z" />
      <circle cx="8" cy="8" r="1.7" />
    </svg>
  );
}

function slotButtonStyle(enabled: boolean) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    padding: 0,
    borderRadius: 3,
    color: enabled ? "var(--color-accent)" : "var(--color-dim)",
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    boxSizing: "border-box",
    opacity: enabled ? 1 : 0.45,
    cursor: enabled ? "pointer" : "not-allowed",
    flexShrink: 0,
  } as const;
}

function MemorySlot({
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
  const [revealed, setRevealed] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);

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

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!slotRef.current?.contains(event.relatedTarget)) {
      setRevealed(false);
    }
  }

  return (
    <div
      ref={slotRef}
      data-testid={testId}
      onMouseEnter={() => {
        if (hasValue) setRevealed(true);
      }}
      onMouseLeave={() => setRevealed(false)}
      onBlur={handleBlur}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) repeat(3, 24px)",
        alignItems: "center",
        gap: 5,
        minWidth: 0,
        minHeight: 34,
        padding: "4px 5px 4px 8px",
        borderRadius: 4,
        border: "1px solid var(--color-border)",
        background: hasValue ? "var(--color-accent-soft)" : "var(--color-surface)",
        color: "var(--color-text)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 1,
          minWidth: 0,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: hasValue ? "var(--color-text)" : "var(--color-dim)",
            fontSize: "var(--size-11)",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <span
          data-testid={`${testId}-status`}
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: hasValue ? "var(--color-accent)" : "var(--color-dim)",
            fontFamily:
              "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
            fontSize: "var(--size-10)",
          }}
        >
          {hasValue ? "stored" : "empty"}
        </span>
      </div>
      <button
        type="button"
        disabled={!hasValue}
        onClick={() => {
          if (hasValue) setRevealed((current) => !current);
        }}
        onFocus={() => {
          if (hasValue) setRevealed(true);
        }}
        data-testid={`${testId}-reveal`}
        aria-label={revealed ? `Hide remembered ${label}` : `Reveal remembered ${label}`}
        aria-expanded={hasValue ? revealed : false}
        title={revealed ? "Hide" : "Reveal"}
        style={slotButtonStyle(hasValue)}
      >
        <RevealGlyph />
      </button>
      <button
        type="button"
        disabled={!hasValue}
        onClick={copyValue}
        data-testid={`${testId}-copy`}
        aria-label={copied ? `Copied remembered ${label}` : `Copy remembered ${label}`}
        title={copied ? "Copied" : "Copy"}
        style={slotButtonStyle(hasValue)}
      >
        <CopyGlyph copied={copied} />
      </button>
      <button
        type="button"
        disabled={!hasValue}
        onClick={onClear}
        data-testid={`${testId}-clear`}
        aria-label={`Clear remembered ${label}`}
        title="Clear"
        style={slotButtonStyle(hasValue)}
      >
        <ClearGlyph />
      </button>
      {hasValue && revealed ? (
        <div
          role="dialog"
          aria-label={`Remembered ${label} value`}
          data-testid={`${testId}-popover`}
          style={{
            position: "absolute",
            zIndex: 20,
            left: 0,
            right: 0,
            top: "calc(100% + 6px)",
            display: "grid",
            gap: 4,
            padding: "8px",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            background: "var(--color-surface)",
            color: "var(--color-text)",
            boxShadow: "0 0 0 1px color-mix(in srgb, var(--color-primary) 18%, transparent)",
          }}
        >
          <span
            style={{
              color: "var(--color-dim)",
              fontSize: "var(--size-10)",
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            remembered {label}
          </span>
          <code
            style={{
              display: "block",
              maxHeight: 104,
              overflow: "auto",
              overflowWrap: "anywhere",
              color: "var(--color-text)",
              fontFamily:
                "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
              fontSize: "var(--size-11)",
              lineHeight: 1.45,
            }}
          >
            {value}
          </code>
        </div>
      ) : null}
    </div>
  );
}

const MEMORY_SLOTS = [
  {
    label: "signing key",
    field: "signingKey",
    clear: "setSigningKey",
    testId: "workbench-memory-key",
  },
  {
    label: "macaroon",
    field: "macaroon",
    clear: "setMacaroon",
    testId: "workbench-memory-macaroon",
  },
  {
    label: "challenge",
    field: "challenge",
    clear: "setChallenge",
    testId: "workbench-memory-challenge",
  },
  {
    label: "credential",
    field: "credential",
    clear: "setCredential",
    testId: "workbench-memory-credential",
  },
] as const;

export function WorkbenchMemoryStrip() {
  const memory = useWorkbenchMemory();
  if (!memory) return null;
  const hasAnyValue = Boolean(
    memory.signingKey || memory.macaroon || memory.challenge || memory.credential,
  );

  return (
    <div
      data-testid="workbench-memory-strip"
      style={{
        maxWidth: 920,
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
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr)",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(142px, 1fr))",
              gap: 8,
              minWidth: 0,
            }}
          >
            {MEMORY_SLOTS.map((slot) => (
              <MemorySlot
                key={slot.field}
                label={slot.label}
                value={memory[slot.field]}
                onClear={() => memory[slot.clear](null)}
                testId={slot.testId}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={!hasAnyValue}
          onClick={memory.clear}
          data-testid="workbench-memory-clear-all"
          style={{
            width: 68,
            minHeight: 34,
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-dim)",
            fontSize: "var(--size-11)",
            fontWeight: 500,
            whiteSpace: "nowrap",
            opacity: hasAnyValue ? 1 : 0.45,
            cursor: hasAnyValue ? "pointer" : "not-allowed",
          }}
        >
          Clear all
        </button>
      </div>
    </div>
  );
}

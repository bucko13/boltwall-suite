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
    width: 22,
    height: 22,
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

const visuallyHiddenStyle = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

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
  const ariaName = label.toLowerCase();

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
        gridTemplateColumns: "minmax(0, 1fr) 8px auto",
        alignItems: "center",
        gap: 7,
        minWidth: 0,
        minHeight: 34,
        padding: "5px 6px 5px 8px",
        borderRadius: 4,
        border: "1px solid var(--color-border)",
        background: hasValue ? "var(--color-accent-soft)" : "var(--color-surface)",
        color: "var(--color-text)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          minWidth: 0,
        }}
      >
        <span
          style={{
            color: hasValue ? "var(--color-text)" : "var(--color-dim)",
            fontSize: "var(--size-12)",
            fontWeight: 600,
            lineHeight: 1.1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <span
          data-testid={`${testId}-status`}
          aria-label={`${ariaName} ${hasValue ? "stored" : "empty"}`}
          style={visuallyHiddenStyle}
        >
          {hasValue ? "stored" : "empty"}
        </span>
      </div>
      <span
        aria-hidden="true"
        title={hasValue ? "Stored" : "Empty"}
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: hasValue ? "var(--color-accent)" : "transparent",
          border: `1px solid ${hasValue ? "var(--color-accent)" : "var(--color-border)"}`,
          flexShrink: 0,
        }}
      />
      <div style={{ display: "flex", gap: 4 }}>
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
          aria-label={revealed ? `Hide remembered ${ariaName}` : `Reveal remembered ${ariaName}`}
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
          aria-label={copied ? `Copied remembered ${ariaName}` : `Copy remembered ${ariaName}`}
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
          aria-label={`Clear remembered ${ariaName}`}
          title="Clear"
          style={slotButtonStyle(hasValue)}
        >
          <ClearGlyph />
        </button>
      </div>
      {hasValue && revealed ? (
        <div
          role="dialog"
          aria-label={`Remembered ${ariaName} value`}
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
            remembered {ariaName}
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
    label: "Signing key",
    field: "signingKey",
    clear: "setSigningKey",
    testId: "workbench-memory-key",
  },
  {
    label: "Macaroon",
    field: "macaroon",
    clear: "setMacaroon",
    testId: "workbench-memory-macaroon",
  },
  {
    label: "Challenge",
    field: "challenge",
    clear: "setChallenge",
    testId: "workbench-memory-challenge",
  },
  {
    label: "Credential",
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
        margin: "8px auto 0",
        padding: "0 24px",
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: "var(--size-10)",
              color: "var(--color-dim)",
              fontWeight: 600,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Workbench memory
          </span>
          <button
            type="button"
            disabled={!hasAnyValue}
            onClick={memory.clear}
            data-testid="workbench-memory-clear-all"
            style={{
              minHeight: 24,
              padding: "3px 7px",
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
            gap: 6,
            minWidth: 0,
            padding: 6,
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "var(--color-surface-alt)",
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
    </div>
  );
}

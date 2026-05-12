"use client";

import type { Caveat } from "@boltwall/l402";
import { useState } from "react";

import { useUrlInput } from "../../lib/url-state";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

const PANEL = "add-expiration";

export function AddExpiration() {
  const [seconds, setSeconds] = useUrlInput<string>(
    "seconds",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );

  const [result, setResult] = useState<{
    condition: string;
    value: string;
    serialized: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function compute() {
    const n = parseInt(seconds ?? "", 10);
    if (isNaN(n) || n < 0) {
      setError("Enter a positive number of seconds.");
      setResult(null);
      return;
    }
    const expiresAt = new Date(Date.now() + n * 1000).toISOString();
    const caveat: Caveat = {
      condition: "valid-until",
      value: expiresAt,
    };
    setResult({
      condition: caveat.condition,
      value: caveat.value,
      serialized: `${caveat.condition}=${caveat.value}`,
    });
    setError(null);
  }

  function reset() {
    setSeconds(null);
    setResult(null);
    setError(null);
  }

  const status = error ? "fail" : result ? "pass" : "idle";
  const statusLabel = error ? "error" : result ? "ready" : "idle";

  return (
    <Cell
      header={
        <HeaderRow
          title="Add Expiration"
          subtitle="Build a valid-until caveat from a TTL in seconds"
          trailing={
            <>
              <StatusPill state={status}>{statusLabel}</StatusPill>
              <CopyUrlButton />
            </>
          }
        />
      }
      body={
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label
            style={{
              fontSize: "var(--size-12)",
              color: "var(--color-dim)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            TTL in seconds
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                min={0}
                value={seconds ?? ""}
                onChange={(e) => {
                  setSeconds(e.target.value);
                  setResult(null);
                  setError(null);
                }}
                placeholder="e.g. 3600"
                data-testid="expiration-seconds-input"
                style={{
                  padding: "6px 10px",
                  background: "var(--color-surface-alt)",
                  border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`,
                  borderRadius: 4,
                  fontSize: "var(--size-13)",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                  width: 160,
                }}
              />
              <button
                type="button"
                onClick={compute}
                data-testid="expiration-compute"
                style={{
                  padding: "6px 12px",
                  background: "var(--color-primary)",
                  color: "var(--color-surface)",
                  border: "none",
                  borderRadius: 4,
                  fontSize: "var(--size-13)",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Build Caveat
              </button>
              <button
                type="button"
                onClick={reset}
                data-testid="expiration-reset"
                style={{
                  padding: "6px 12px",
                  background: "var(--color-surface)",
                  color: "var(--color-dim)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 4,
                  fontSize: "var(--size-13)",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            </div>
          </label>

          {error ? (
            <div
              data-testid="expiration-error"
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-danger)",
              }}
            >
              {error}
            </div>
          ) : null}

          {result ? (
            <div
              data-testid="expiration-output"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "10px 12px",
                background: "var(--color-surface-alt)",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
                fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                fontSize: "var(--size-13)",
              }}
            >
              <div>
                <span style={{ color: "var(--color-dim)" }}>condition: </span>
                <span style={{ color: "var(--color-accent)" }}>{result.condition}</span>
              </div>
              <div>
                <span style={{ color: "var(--color-dim)" }}>value: </span>
                <span style={{ color: "var(--color-text)" }}>{result.value}</span>
              </div>
              <div>
                <span style={{ color: "var(--color-dim)" }}>serialized: </span>
                <span style={{ color: "var(--color-text)" }}>{result.serialized}</span>
              </div>
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          template={`import type { Caveat } from "@boltwall/l402";\n\nconst ttlSeconds = {{seconds}};\nconst caveat: Caveat = {\n  condition: "valid-until",\n  value: new Date(Date.now() + ttlSeconds * 1000).toISOString(),\n};\n// -> { condition: "valid-until", value: "<iso-timestamp>" }`}
          values={{ seconds: seconds || "3600" }}
        />
      }
    />
  );
}

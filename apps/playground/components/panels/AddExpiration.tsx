"use client";

import { validUntil } from "@boltwall/l402";
import { useState } from "react";

import { useUrlInput } from "../../lib/url-state";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

import { panelInputStyle, panelOutputStyle } from "./panel-styles";

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
    const caveat = validUntil({ seconds: n });
    setResult({
      condition: caveat.condition,
      value: caveat.value,
      serialized: caveat.encode(),
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
  const ttlSecondsLiteral = /^[0-9]+$/.test(seconds ?? "") ? (seconds ?? "") : "3600";
  const caveatValueLiteral = JSON.stringify(result?.value ?? "");

  return (
    <Cell
      header={
        <HeaderRow
          title="Valid-until Caveat"
          subtitle="Create a valid-until caveat from a TTL"
          trailing={
            <>
              <StatusPill state={status} details={error}>
                {statusLabel}
              </StatusPill>
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
                  ...panelInputStyle(Boolean(error)),
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
                ...panelOutputStyle(),
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
          contract={result ? "exact" : "recipe"}
          template={
            result
              ? `import { validUntil } from "@boltwall/l402";\n\nconst caveat = validUntil({ iso: {{caveatValueLiteral}} });`
              : `import { validUntil } from "@boltwall/l402";\n\nconst ttlSeconds = {{seconds}};\nconst caveat = validUntil({ seconds: ttlSeconds });`
          }
          values={{ seconds: ttlSecondsLiteral, caveatValueLiteral }}
        />
      }
    />
  );
}

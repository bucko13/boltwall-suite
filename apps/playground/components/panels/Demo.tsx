"use client";

import { useState } from "react";

import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

const DEFAULT_DEMO_ENDPOINT = "https://pokeapi.co/api/v2/pokemon/1";
const CONFIGURED_DEMO_ENDPOINT =
  process.env.NEXT_PUBLIC_BOLTWALL_PLAYGROUND_DEMO_ENDPOINT ?? DEFAULT_DEMO_ENDPOINT;

type DemoResult = {
  status: number;
  authenticate: string | null;
  body: string;
};

export function Demo() {
  const [endpoint, setEndpoint] = useState(CONFIGURED_DEMO_ENDPOINT);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const endpointReady = endpoint.trim() !== "";

  async function fetchEndpoint() {
    const target = endpoint.trim();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(target, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const text = await response.text();
      setResult({
        status: response.status,
        authenticate: response.headers.get("www-authenticate"),
        body: text.slice(0, 1500),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const status = error ? "fail" : result ? (result.status >= 400 ? "warn" : "pass") : "idle";
  const statusLabel = error
    ? "error"
    : result
      ? String(result.status)
      : loading
        ? "loading"
        : "idle";

  return (
    <Cell
      header={
        <HeaderRow
          title="Demo"
          subtitle="Fetch a configurable demo endpoint"
          trailing={
            <StatusPill state={status} details={error}>
              {statusLabel}
            </StatusPill>
          }
        />
      }
      body={
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: "var(--size-12)",
              color: "var(--color-dim)",
            }}
          >
            Endpoint
            <input
              type="url"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              data-testid="demo-endpoint-input"
              style={{
                width: "100%",
                minWidth: 0,
                padding: "8px 10px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
                color: "var(--color-text)",
                fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                fontSize: "var(--size-12)",
              }}
            />
          </label>

          <button
            type="button"
            onClick={fetchEndpoint}
            disabled={loading || !endpointReady}
            data-testid="demo-fetch"
            style={{
              padding: "8px 16px",
              background: "var(--color-primary)",
              color: "var(--color-surface)",
              border: "none",
              borderRadius: 4,
              fontSize: "var(--size-13)",
              fontWeight: 500,
              cursor: loading ? "wait" : endpointReady ? "pointer" : "not-allowed",
              opacity: loading || !endpointReady ? 0.7 : 1,
              alignSelf: "flex-start",
            }}
          >
            {loading ? "Fetching..." : "Fetch Endpoint"}
          </button>

          {error ? (
            <div
              data-testid="demo-error"
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
              data-testid="demo-output"
              style={{
                display: "grid",
                gridTemplateColumns: "110px 1fr",
                gap: "6px 12px",
                padding: "12px 14px",
                background: "var(--color-accent-soft)",
                border: "1px solid var(--color-accent)",
                borderRadius: 4,
                fontSize: "var(--size-13)",
              }}
            >
              <span style={{ color: "var(--color-dim)" }}>status</span>
              <span data-testid="demo-status">{result.status}</span>
              <span style={{ color: "var(--color-dim)" }}>challenge</span>
              <span
                data-testid="demo-authenticate"
                style={{
                  fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                  fontSize: "var(--size-12)",
                  wordBreak: "break-all",
                }}
              >
                {result.authenticate ?? "(none)"}
              </span>
              <span style={{ color: "var(--color-dim)" }}>body</span>
              <pre
                data-testid="demo-body"
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                  fontSize: "var(--size-12)",
                }}
              >
                {result.body}
              </pre>
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          contract="recipe"
          template={`const response = await fetch({{endpointLiteral}}, {\n  headers: { accept: "application/json" },\n  cache: "no-store",\n});\n\nconst challenge = response.headers.get("www-authenticate");\nconst body = await response.text();`}
          values={{ endpointLiteral: JSON.stringify(endpoint) }}
        />
      }
    />
  );
}

"use client";

import {
  decodeIdentifier,
  parseAuthenticateHeader,
  type L402ChallengeFields,
} from "@boltwall/l402";
import { useState } from "react";

import { useUrlInput } from "../../lib/url-state";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { MacaroonStripe, type MacaroonSegments } from "../ui/macaroon-stripe";
import { StatusPill } from "../ui/status-pill";
import { TruncMiddle } from "../ui/trunc-middle";

import { panelTextareaStyle } from "./panel-styles";

const PANEL = "from-challenge";

export function FromChallenge() {
  const [challenge, setChallenge] = useUrlInput<string>(
    "challenge",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );

  const [fields, setFields] = useState<L402ChallengeFields[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<number>(0);

  function parse() {
    if (!(challenge ?? "").trim()) {
      setError("Paste a WWW-Authenticate header value.");
      setFields(null);
      return;
    }
    try {
      const parsed = parseAuthenticateHeader((challenge ?? "").trim());
      setFields(parsed);
      setSelectedField(0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFields(null);
    }
  }

  function reset() {
    setChallenge(null);
    setFields(null);
    setError(null);
    setSelectedField(0);
  }

  const status = error ? "fail" : fields ? "pass" : "idle";
  const statusLabel = error
    ? "error"
    : fields
      ? `${fields.length} challenge${fields.length > 1 ? "s" : ""}`
      : "idle";

  const current = fields?.[selectedField] ?? null;
  const challengeLiteral = JSON.stringify((challenge ?? "").trim() || "<WWW-Authenticate value>");

  let stripeSegments: MacaroonSegments | null = null;
  if (current?.macaroon) {
    try {
      const id = decodeIdentifier(current.macaroon);
      stripeSegments = {
        identifier: id.paymentHash,
        location: "",
        caveats: [],
        signature: id.tokenId,
      };
    } catch {
      stripeSegments = null;
    }
  }

  return (
    <Cell
      header={
        <HeaderRow
          title="From Challenge"
          subtitle="Parse a WWW-Authenticate L402 challenge header"
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
            WWW-Authenticate header value
            <textarea
              value={challenge ?? ""}
              onChange={(e) => {
                setChallenge(e.target.value);
                setFields(null);
                setError(null);
              }}
              placeholder='L402 macaroon="...", invoice="lnbc..."'
              data-testid="challenge-input"
              rows={3}
              style={{
                ...panelTextareaStyle(Boolean(error)),
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={parse}
              data-testid="challenge-parse"
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
              Parse
            </button>
            <button
              type="button"
              onClick={reset}
              data-testid="challenge-reset"
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

          {error ? (
            <div
              data-testid="challenge-error"
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-danger)",
              }}
            >
              {error}
            </div>
          ) : null}

          {fields && fields.length > 1 ? (
            <div style={{ display: "flex", gap: 6 }}>
              {fields.map((f, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedField(i)}
                  style={{
                    padding: "4px 10px",
                    fontSize: "var(--size-12)",
                    fontWeight: 500,
                    background:
                      i === selectedField ? "var(--color-primary)" : "var(--color-surface-alt)",
                    color: i === selectedField ? "var(--color-surface)" : "var(--color-dim)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  {f.scheme}
                </button>
              ))}
            </div>
          ) : null}

          {current ? (
            <div
              data-testid="challenge-output"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr",
                  gap: "6px 12px",
                  fontSize: "var(--size-13)",
                }}
              >
                <span style={{ color: "var(--color-dim)" }}>scheme</span>
                <span
                  data-testid="challenge-scheme"
                  style={{
                    color: "var(--color-accent)",
                    fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                    fontWeight: 500,
                  }}
                >
                  {current.scheme}
                </span>
                <span style={{ color: "var(--color-dim)" }}>macaroon</span>
                <span data-testid="challenge-macaroon">
                  <TruncMiddle value={current.macaroon || "(empty)"} head={12} tail={8} />
                </span>
                <span style={{ color: "var(--color-dim)" }}>invoice</span>
                <span data-testid="challenge-invoice">
                  <TruncMiddle value={current.invoice || "(empty)"} head={12} tail={8} />
                </span>
              </div>

              {stripeSegments ? <MacaroonStripe segments={stripeSegments} /> : null}
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          contract="current-input"
          template={`import { parseAuthenticateHeader } from "@boltwall/l402";\n\nconst header = {{challengeLiteral}};\nconst challenges = parseAuthenticateHeader(header);\n// -> [{ scheme, macaroon, invoice }, ...]`}
          values={{
            challengeLiteral,
          }}
        />
      }
    />
  );
}

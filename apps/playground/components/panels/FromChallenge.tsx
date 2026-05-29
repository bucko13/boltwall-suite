"use client";

import { decodeIdentifier, L402 } from "@boltwall/l402";
import { useState } from "react";

import { useRememberedStringInput, useWorkbenchMemory } from "../../lib/url-state";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { MacaroonStripe, type MacaroonSegments } from "../ui/macaroon-stripe";
import { StatusPill } from "../ui/status-pill";
import { TruncMiddle } from "../ui/trunc-middle";

import { panelOutputStyle, panelTextareaStyle } from "./panel-styles";

const PANEL = "from-challenge";

type ParsedChallenge = {
  token: L402;
  scheme: "L402" | "LSAT";
};

export function FromChallenge() {
  const workbenchMemory = useWorkbenchMemory();
  const [challenge, setChallenge] = useRememberedStringInput("challenge", {
    panel: PANEL,
    field: "challenge",
  });

  const [fields, setFields] = useState<ParsedChallenge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<number>(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  function parse() {
    if (!(challenge ?? "").trim()) {
      setError("Paste a WWW-Authenticate header value.");
      setFields(null);
      return;
    }
    try {
      const raw = (challenge ?? "").trim();
      const header = raw.replace(/^WWW-Authenticate:\s*/i, "");
      const token = L402.fromHeader(header);
      workbenchMemory?.setMacaroon(token.macaroon);
      setFields([{ token, scheme: /\bL402\s+/i.test(header) ? "L402" : "LSAT" }]);
      setSelectedField(0);
      setError(null);
      setCopyState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFields(null);
      workbenchMemory?.setMacaroon(null);
    }
  }

  function reset() {
    setChallenge(null);
    setFields(null);
    setError(null);
    setSelectedField(0);
    setCopyState("idle");
    workbenchMemory?.setMacaroon(null);
  }

  async function copyInvoice() {
    if (!current?.token.invoice) return;
    try {
      await navigator.clipboard.writeText(current.token.invoice);
      setCopyState("copied");
    } catch (error) {
      if (error instanceof DOMException || error instanceof Error) {
        setCopyState("failed");
        return;
      }
      setCopyState("failed");
    }
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
  if (current?.token.macaroon) {
    try {
      const id = decodeIdentifier(current.token.macaroon);
      stripeSegments = {
        identifier: id.paymentHash,
        location: "",
        caveats: [],
        signature: id.tokenId,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "unsupported-identifier-version") {
        stripeSegments = null;
      }
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
            WWW-Authenticate header value
            <textarea
              value={challenge ?? ""}
              onChange={(e) => {
                setChallenge(e.target.value);
                setFields(null);
                setError(null);
                setCopyState("idle");
                workbenchMemory?.setMacaroon(null);
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
                  onClick={() => {
                    setSelectedField(i);
                    setCopyState("idle");
                    workbenchMemory?.setMacaroon(f.token.macaroon);
                  }}
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
                ...panelOutputStyle(),
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: "var(--size-11)",
                  color: "var(--color-dim)",
                  fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                }}
              >
                Parsed challenge fields
              </div>
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
                  <TruncMiddle value={current.token.macaroon || "(empty)"} head={12} tail={8} />
                </span>
                <span style={{ color: "var(--color-dim)" }}>invoice</span>
                <span data-testid="challenge-invoice">
                  <TruncMiddle value={current.token.invoice || "(empty)"} head={12} tail={8} />
                </span>
              </div>

              {stripeSegments ? <MacaroonStripe segments={stripeSegments} /> : null}

              <div
                data-testid="challenge-next-actions"
                style={{
                  borderTop: "1px solid var(--color-border)",
                  paddingTop: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: "var(--size-11)",
                    color: "var(--color-dim)",
                    fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                  }}
                >
                  Remembered parts
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={copyInvoice}
                    disabled={!current.token.invoice}
                    data-testid="challenge-copy-invoice"
                    title="Copy the Lightning invoice from this challenge."
                    style={{
                      padding: "6px 10px",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 4,
                      fontSize: "var(--size-12)",
                      fontWeight: 500,
                      cursor: current.token.invoice ? "pointer" : "not-allowed",
                    }}
                  >
                    Copy invoice
                  </button>
                </div>
                <div
                  data-testid="challenge-next-action-status"
                  style={{
                    fontSize: "var(--size-12)",
                    color: copyState === "failed" ? "var(--color-danger)" : "var(--color-dim)",
                  }}
                >
                  Macaroon is stored in Workbench memory; invoice remains part of this challenge.
                  {copyState === "copied" ? " Invoice copied." : null}
                  {copyState === "failed" ? " Invoice copy failed." : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          contract="current-input"
          template={`import { L402 } from "@boltwall/l402";\n\nconst header = {{challengeLiteral}};\nconst token = L402.fromHeader(header);\n// token.macaroon, token.invoice\nconst preimage = "<64-char hex preimage>";\ntoken.setPreimage(preimage);\nconst authorization = token.toAuthorizationHeader();`}
          values={{
            challengeLiteral,
          }}
        />
      }
    />
  );
}

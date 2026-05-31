"use client";

import { L402, type MacaroonInspection } from "@boltwall/l402";
import { useState } from "react";

import { describeArtifactError, detectArtifact } from "../../lib/detect-artifact";
import { bytesToHex } from "../../lib/hex";
import { useWorkbenchMemory } from "../../lib/url-state";
import { CaveatPill } from "../ui/caveat-pill";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { FillFromWorkbench } from "../ui/fill-from-workbench";
import { HeaderRow } from "../ui/header-row";
import { MacaroonStripe, type MacaroonSegments } from "../ui/macaroon-stripe";
import { StatusPill } from "../ui/status-pill";
import { ViewModeToggle, type ViewMode } from "../ui/view-mode-toggle";

import { panelOutputStyle, panelTextareaStyle } from "./panel-styles";

type ViewModeValue = "raw" | "json" | "stripe";

/** A challenge carries an invoice + scheme alongside its macaroon. */
type ChallengeFields = { invoice: string; scheme: "L402" | "LSAT" };

type ParseResult = {
  inspection: MacaroonInspection;
  challenge: ChallengeFields | null;
};

/**
 * A dual challenge advertises both schemes; report L402 when present, else LSAT
 * (matches the WWW-Authenticate emission order).
 */
function schemeOf(input: string): "L402" | "LSAT" {
  const header = input.replace(/^WWW-Authenticate:\s*/i, "");
  return /\bL402\s+/i.test(header) ? "L402" : "LSAT";
}

function buildStripeSegments(inspection: MacaroonInspection): MacaroonSegments {
  return {
    identifier: inspection.identifierBytes,
    location: "",
    caveats: inspection.caveats,
    signature: inspection.signature,
  };
}

export function ParseToken() {
  const workbenchMemory = useWorkbenchMemory();

  // Inputs are plain local state — never auto-synced to the URL or Workbench.
  const [input, setInput] = useState("");
  const [viewMode, setViewMode] = useState<ViewModeValue>("raw");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invoiceCopied, setInvoiceCopied] = useState(false);

  function parse() {
    const detected = detectArtifact(input);
    if (!detected.ok) {
      setError(describeArtifactError(detected.error));
      setParseResult(null);
      return;
    }
    try {
      const inspection = L402.fromMacaroon(detected.value.macaroon).inspectMacaroon();
      const challenge: ChallengeFields | null =
        detected.value.kind === "challenge"
          ? { invoice: detected.value.token.invoice ?? "", scheme: schemeOf(input) }
          : null;
      setParseResult({ inspection, challenge });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setParseResult(null);
    }
  }

  function changeInput(next: string) {
    setInput(next);
    setParseResult(null);
    setError(null);
    setInvoiceCopied(false);
  }

  function clearPage() {
    changeInput("");
  }

  function clearBoth() {
    clearPage();
    workbenchMemory?.setMacaroon(null);
    workbenchMemory?.setChallenge(null);
    workbenchMemory?.setCredential(null);
  }

  async function copyInvoice() {
    if (!parseResult?.challenge?.invoice) return;
    try {
      await navigator.clipboard.writeText(parseResult.challenge.invoice);
      setInvoiceCopied(true);
      window.setTimeout(() => setInvoiceCopied(false), 1500);
    } catch {
      // Copy is a progressive enhancement; keep the flow usable.
    }
  }

  const status = error ? "fail" : parseResult ? "pass" : "idle";
  const statusLabel = error ? "error" : parseResult ? "decoded" : "idle";
  const detectedInput = input.trim() ? detectArtifact(input) : null;
  const tokenLiteral = JSON.stringify(
    detectedInput?.ok ? detectedInput.value.macaroon : "<base64 macaroon>",
  );
  const rememberedMacaroon = workbenchMemory?.macaroon ?? "";
  const rememberedChallenge = workbenchMemory?.challenge ?? "";
  const rememberedCredential = workbenchMemory?.credential ?? "";

  return (
    <Cell
      header={
        <HeaderRow
          title="Parse"
          subtitle="Decode a macaroon, challenge, or credential into its identifier, caveats, and signature"
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
              fontSize: "var(--size-12)",
              color: "var(--color-dim)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            Macaroon, L402 challenge, or credential
            <textarea
              value={input}
              onChange={(e) => changeInput(e.target.value)}
              placeholder='AGIA...   ·   L402 macaroon="AGIA...", invoice="lnbc1..."   ·   L402 <macaroon>:<preimage>'
              data-testid="parse-token-input"
              rows={3}
              style={{
                ...panelTextareaStyle(Boolean(error)),
              }}
            />
          </label>

          <div
            data-testid="parse-token-workbench-actions"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              fontSize: "var(--size-11)",
              color: "var(--color-dim)",
            }}
          >
            <span style={{ fontWeight: 600, textTransform: "uppercase" }}>Workbench</span>
            <FillFromWorkbench
              label="macaroon"
              available={rememberedMacaroon}
              current={input}
              onFill={changeInput}
              testId="parse-token-fill-macaroon"
            />
            <FillFromWorkbench
              label="challenge"
              available={rememberedChallenge}
              current={input}
              onFill={changeInput}
              testId="parse-token-fill-challenge"
            />
            <FillFromWorkbench
              label="credential"
              available={rememberedCredential}
              current={input}
              onFill={changeInput}
              testId="parse-token-fill-credential"
            />
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={parse}
              data-testid="parse-token-decode"
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
              Decode
            </button>
            <button
              type="button"
              onClick={clearPage}
              data-testid="parse-token-reset"
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
              Clear page
            </button>
            <button
              type="button"
              onClick={clearBoth}
              data-testid="parse-token-clear-both"
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
              Clear both
            </button>
            {parseResult ? (
              <ViewModeToggle
                value={viewMode as ViewMode}
                onChange={(m) => setViewMode(m as ViewModeValue)}
                modes={["raw", "json", "stripe"] as ViewMode[]}
              />
            ) : null}
          </div>

          {error ? (
            <div
              data-testid="parse-token-error"
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-danger)",
              }}
            >
              {error}
            </div>
          ) : null}

          {parseResult?.challenge ? (
            <div
              data-testid="parse-token-challenge"
              style={{
                ...panelOutputStyle(),
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
                Challenge ({parseResult.challenge.scheme})
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <code
                  data-testid="parse-token-invoice"
                  style={{
                    flex: 1,
                    fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                    fontSize: "var(--size-12)",
                    wordBreak: "break-all",
                    color: "var(--color-text)",
                  }}
                >
                  {parseResult.challenge.invoice}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void copyInvoice();
                  }}
                  data-testid="parse-token-copy-invoice"
                  aria-label={invoiceCopied ? "Invoice copied" : "Copy invoice"}
                  title={invoiceCopied ? "Invoice copied" : "Copy invoice"}
                  style={{
                    minWidth: 32,
                    background: invoiceCopied ? "var(--color-accent-soft)" : "var(--color-surface)",
                    color: invoiceCopied ? "var(--color-accent)" : "var(--color-text)",
                    border: `1px solid ${invoiceCopied ? "var(--color-accent)" : "var(--color-border)"}`,
                    borderRadius: 4,
                    fontSize: "var(--size-13)",
                    cursor: "pointer",
                  }}
                >
                  {invoiceCopied ? "✓" : "⧉"}
                </button>
              </div>
            </div>
          ) : null}

          {parseResult ? (
            <div
              data-testid="parse-token-output"
              style={{ ...panelOutputStyle(), display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div
                style={{
                  fontSize: "var(--size-11)",
                  color: "var(--color-dim)",
                  fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                }}
              >
                Decoded macaroon fields
              </div>
              {viewMode === "raw" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr",
                    gap: "6px 12px",
                    fontSize: "var(--size-13)",
                    fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                  }}
                >
                  <span style={{ color: "var(--color-dim)" }}>version</span>
                  <span>{parseResult.inspection.identifier.version}</span>
                  <span style={{ color: "var(--color-dim)" }}>paymentHash</span>
                  <span data-testid="parse-token-payment-hash" style={{ wordBreak: "break-all" }}>
                    {bytesToHex(parseResult.inspection.identifier.paymentHash)}
                  </span>
                  <span style={{ color: "var(--color-dim)" }}>tokenId</span>
                  <span data-testid="parse-token-token-id" style={{ wordBreak: "break-all" }}>
                    {bytesToHex(parseResult.inspection.identifier.tokenId)}
                  </span>
                  <span style={{ color: "var(--color-dim)" }}>caveats</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {parseResult.inspection.caveats.length === 0 ? (
                      <span style={{ color: "var(--color-dim)" }}>none</span>
                    ) : (
                      parseResult.inspection.caveats.map((c, i) => (
                        <CaveatPill key={i} state="unsatisfied">
                          {c.condition}={c.value}
                        </CaveatPill>
                      ))
                    )}
                  </div>
                  <span style={{ color: "var(--color-dim)" }}>signature</span>
                  <span data-testid="parse-token-signature" style={{ wordBreak: "break-all" }}>
                    {bytesToHex(parseResult.inspection.signature)}
                  </span>
                </div>
              )}
              {viewMode === "json" && (
                <pre
                  style={{
                    margin: 0,
                    padding: "12px",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    fontSize: "var(--size-12-5)",
                    fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                    overflowX: "auto",
                    color: "var(--color-text)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {JSON.stringify(
                    {
                      version: parseResult.inspection.identifier.version,
                      paymentHash: bytesToHex(parseResult.inspection.identifier.paymentHash),
                      tokenId: bytesToHex(parseResult.inspection.identifier.tokenId),
                      caveats: parseResult.inspection.caveats.map((c) => ({
                        condition: c.condition,
                        value: c.value,
                      })),
                      signature: bytesToHex(parseResult.inspection.signature),
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
              {viewMode === "stripe" && (
                <MacaroonStripe segments={buildStripeSegments(parseResult.inspection)} />
              )}
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          contract="current-input"
          template={`import { L402 } from "@boltwall/l402";\n\nconst macaroon = {{tokenLiteral}};\nconst inspection = L402.fromMacaroon(macaroon).inspectMacaroon();\n// -> { identifier, caveats, signature }`}
          values={{
            tokenLiteral,
          }}
        />
      }
    />
  );
}

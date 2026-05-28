"use client";

import {
  inspectMacaroon,
  parseAuthorizationHeader,
  parseAuthenticateHeader,
  type MacaroonInspection,
} from "@boltwall/l402";
import { useState } from "react";

import { useRememberedStringInput, useUrlInput, useWorkbenchMemory } from "../../lib/url-state";
import { CaveatPill } from "../ui/caveat-pill";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { MacaroonStripe, type MacaroonSegments } from "../ui/macaroon-stripe";
import { StatusPill } from "../ui/status-pill";
import { ViewModeToggle, type ViewMode } from "../ui/view-mode-toggle";

import { panelOutputStyle, panelTextareaStyle } from "./panel-styles";

const PANEL = "parse-token";

type ViewModeValue = "raw" | "json" | "stripe";

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function normalizeChallengeInput(input: string): string {
  return input.replace(/^WWW-Authenticate:\s*/i, "").trim();
}

function extractMacaroonInput(input: string): {
  macaroon: string;
  source: "macaroon" | "challenge" | "credential";
} {
  const trimmed = input.trim();
  if (!trimmed) return { macaroon: "", source: "macaroon" };

  try {
    const parsed = parseAuthorizationHeader(trimmed.replace(/^Authorization:\s*/i, ""));
    const macaroon = parsed.macaroons[0];
    if (macaroon) return { macaroon, source: "credential" };
  } catch {
    // Challenge and raw macaroon inputs are handled below.
  }

  try {
    const challenges = parseAuthenticateHeader(normalizeChallengeInput(trimmed));
    const challenge = challenges.find((entry) => entry.scheme === "L402") ?? challenges[0];
    if (challenge?.macaroon) {
      return { macaroon: challenge.macaroon, source: "challenge" };
    }
  } catch {
    // Plain macaroon input is still the primary Parse workflow.
  }

  return { macaroon: trimmed, source: "macaroon" };
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
  const [token, setToken] = useRememberedStringInput("token", {
    panel: PANEL,
    field: "macaroon",
  });

  const [viewMode, setViewMode] = useUrlInput<string>(
    "view",
    (raw) => raw ?? "raw",
    (v) => v || null,
    { panel: PANEL },
  );

  const [parseResult, setParseResult] = useState<{
    inspection: MacaroonInspection;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function parse() {
    const input = (token ?? "").trim() || workbenchMemory?.challenge.trim() || "";
    const extracted = extractMacaroonInput(input);
    if (!extracted.macaroon) {
      setError("Paste a base64-encoded macaroon or WWW-Authenticate L402 challenge.");
      setParseResult(null);
      return;
    }
    try {
      const inspection = inspectMacaroon(extracted.macaroon);
      setParseResult({ inspection });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setParseResult(null);
    }
  }

  function reset() {
    setToken(null);
    workbenchMemory?.setChallenge(null);
    setParseResult(null);
    setError(null);
  }

  const status = error ? "fail" : parseResult ? "pass" : "idle";
  const statusLabel = error ? "error" : parseResult ? "decoded" : "idle";
  const activeView = (viewMode as ViewModeValue) || "raw";
  const inputValue = (token ?? "") || workbenchMemory?.challenge || "";
  const extractedInput = extractMacaroonInput(inputValue);
  const tokenLiteral = JSON.stringify(extractedInput.macaroon || "<base64 macaroon>");

  return (
    <Cell
      header={
        <HeaderRow
          title="Parse Token"
          subtitle="Decode a base64 macaroon: identifier fields, caveats, signature"
          trailing={
            <>
              <StatusPill state={status} details={error}>
                {statusLabel}
              </StatusPill>
              <CopyUrlButton sensitiveStateWarning="This share URL can include full credentials. Share only with trusted recipients." />
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
            Base64 macaroon, L402 challenge, or Authorization credential
            <textarea
              value={inputValue}
              onChange={(e) => {
                setToken(e.target.value);
                workbenchMemory?.setChallenge(null);
                setParseResult(null);
                setError(null);
              }}
              placeholder='L402 macaroon="AGIAJEemVQ...", invoice="lnbc1..."'
              data-testid="parse-token-input"
              rows={3}
              style={{
                ...panelTextareaStyle(Boolean(error)),
              }}
            />
          </label>

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
              onClick={reset}
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
              Reset
            </button>
            {parseResult ? (
              <ViewModeToggle
                value={activeView as ViewMode}
                onChange={(m) => setViewMode(m)}
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
              {activeView === "raw" && (
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
              {activeView === "json" && (
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
              {activeView === "stripe" && (
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
          template={`import { inspectMacaroon } from "@boltwall/l402";\n\nconst macaroon = {{tokenLiteral}};\nconst inspection = inspectMacaroon(macaroon);\n// -> { identifier, caveats, signature }`}
          values={{
            tokenLiteral,
          }}
        />
      }
    />
  );
}

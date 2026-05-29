"use client";

import { L402, type MacaroonInspection } from "@boltwall/l402";
import { useState } from "react";

import { bytesToHex } from "../../lib/hex";
import { useUrlInput, useWorkbenchMemory } from "../../lib/url-state";
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

function normalizeChallengeInput(input: string): string {
  return input.replace(/^WWW-Authenticate:\s*/i, "").trim();
}

function normalizeAuthorizationInput(input: string): string {
  return input.replace(/^Authorization:\s*/i, "").trim();
}

function isChallengeLikeInput(input: string): boolean {
  return /^(WWW-Authenticate:\s*)?(L402|LSAT)\s+macaroon=/i.test(input.trim());
}

function isCredentialLikeInput(input: string): boolean {
  const normalized = normalizeAuthorizationInput(input);
  return /^(L402|LSAT)\s+/i.test(normalized) && !/\bmacaroon=/i.test(normalized);
}

function extractMacaroonInput(input: string): {
  token: L402 | null;
  macaroon: string;
  source: "macaroon" | "challenge" | "credential";
} {
  const trimmed = input.trim();
  if (!trimmed) return { token: null, macaroon: "", source: "macaroon" };

  if (isChallengeLikeInput(trimmed)) {
    try {
      const token = L402.fromHeader(normalizeChallengeInput(trimmed));
      return { token, macaroon: token.macaroon, source: "challenge" };
    } catch (challengeError) {
      if (challengeError instanceof Error && challengeError.message === "empty-header") {
        return { token: null, macaroon: "", source: "challenge" };
      }
      // Plain macaroon input is still the primary Parse workflow.
    }
  }

  if (isCredentialLikeInput(trimmed)) {
    try {
      const token = L402.fromToken(normalizeAuthorizationInput(trimmed));
      return { token, macaroon: token.macaroon, source: "credential" };
    } catch (credentialError) {
      if (credentialError instanceof Error && credentialError.message === "empty-macaroons") {
        return { token: null, macaroon: "", source: "credential" };
      }
      // Plain macaroon input is still the primary Parse workflow.
    }
  }

  try {
    return { token: L402.fromMacaroon(trimmed), macaroon: trimmed, source: "macaroon" };
  } catch {
    return { token: null, macaroon: trimmed, source: "macaroon" };
  }
}

function buildStripeSegments(inspection: MacaroonInspection): MacaroonSegments {
  return {
    identifier: inspection.identifierBytes,
    location: "",
    caveats: inspection.caveats,
    signature: inspection.signature,
  };
}

function workbenchButtonStyle(enabled: boolean) {
  return {
    padding: "4px 8px",
    background: enabled ? "var(--color-surface)" : "var(--color-surface-alt)",
    color: enabled ? "var(--color-text)" : "var(--color-dim)",
    border: "1px solid var(--color-border)",
    borderRadius: 4,
    fontSize: "var(--size-11)",
    fontWeight: 500,
    cursor: enabled ? "pointer" : "not-allowed",
  } as const;
}

export function ParseToken() {
  const workbenchMemory = useWorkbenchMemory();
  const [token, setToken] = useUrlInput<string>(
    "token",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );

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
    const input = (token ?? "").trim();
    const extracted = extractMacaroonInput(input);
    if (!extracted.macaroon) {
      setError("Paste a base64-encoded macaroon or WWW-Authenticate L402 challenge.");
      setParseResult(null);
      return;
    }
    try {
      const inspection = L402.fromMacaroon(extracted.macaroon).inspectMacaroon();
      setParseResult({ inspection });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setParseResult(null);
    }
  }

  function clearPage() {
    setToken(null);
    setParseResult(null);
    setError(null);
  }

  function clearBoth() {
    clearPage();
    workbenchMemory?.setMacaroon(null);
    workbenchMemory?.setChallenge(null);
    workbenchMemory?.setCredential(null);
  }

  function fillFromWorkbench(value: string) {
    setToken(value);
    setParseResult(null);
    setError(null);
  }

  const status = error ? "fail" : parseResult ? "pass" : "idle";
  const statusLabel = error ? "error" : parseResult ? "decoded" : "idle";
  const activeView = (viewMode as ViewModeValue) || "raw";
  const inputValue = token ?? "";
  const extractedInput = extractMacaroonInput(inputValue);
  const tokenLiteral = JSON.stringify(extractedInput.macaroon || "<base64 macaroon>");
  const rememberedMacaroon = workbenchMemory?.macaroon.trim() ?? "";
  const rememberedChallenge = workbenchMemory?.challenge.trim() ?? "";
  const rememberedCredential = workbenchMemory?.credential.trim() ?? "";

  return (
    <Cell
      header={
        <HeaderRow
          title="Parse Macaroon"
          subtitle="Decode a macaroon, or extract one from a challenge or credential"
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
            Macaroon, WWW-Authenticate challenge, or Authorization credential
            <textarea
              value={inputValue}
              onChange={(e) => {
                setToken(e.target.value);
                workbenchMemory?.setChallenge(null);
                setParseResult(null);
                setError(null);
              }}
              placeholder='AGIA... or L402 macaroon="AGIA...", invoice="lnbc1..."'
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
            <button
              type="button"
              onClick={() => fillFromWorkbench(rememberedMacaroon)}
              disabled={!rememberedMacaroon}
              data-testid="parse-token-fill-macaroon"
              style={workbenchButtonStyle(Boolean(rememberedMacaroon))}
            >
              Fill macaroon
            </button>
            <button
              type="button"
              onClick={() => fillFromWorkbench(rememberedChallenge)}
              disabled={!rememberedChallenge}
              data-testid="parse-token-fill-challenge"
              style={workbenchButtonStyle(Boolean(rememberedChallenge))}
            >
              Fill challenge
            </button>
            <button
              type="button"
              onClick={() => fillFromWorkbench(rememberedCredential)}
              disabled={!rememberedCredential}
              data-testid="parse-token-fill-credential"
              style={workbenchButtonStyle(Boolean(rememberedCredential))}
            >
              Fill credential
            </button>
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
          template={`import { L402 } from "@boltwall/l402";\n\nconst macaroon = {{tokenLiteral}};\nconst inspection = L402.fromMacaroon(macaroon).inspectMacaroon();\n// -> { identifier, caveats, signature }`}
          values={{
            tokenLiteral,
          }}
        />
      }
    />
  );
}

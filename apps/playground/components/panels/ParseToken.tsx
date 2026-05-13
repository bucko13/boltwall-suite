"use client";

import { decodeIdentifier, parseCaveat, type MacaroonIdentifierV0 } from "@boltwall/l402";
import { useState } from "react";

import { useRememberedStringInput, useUrlInput } from "../../lib/url-state";
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

function base64ToBytes(b64: string): Uint8Array {
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Extract caveats from a raw V2 macaroon binary.
 * V2 format (encodeBinaryV2 in packages/l402/src/internal/macaroon.ts):
 * 0x02 (version) | 0x02 <len> <identifier> | 0x00 (EOS header)
 * [ 0x02 <len> <caveat> | 0x00 (EOS caveat) ] * N
 * 0x00 (EOS caveat list) | 0x06 <len> <signature>
 */
function extractRawCaveats(
  macaroonBytes: Uint8Array,
): Array<{ raw: Uint8Array; condition: string; value: string }> {
  const caveats: Array<{ raw: Uint8Array; condition: string; value: string }> = [];
  const dec = new TextDecoder();

  if (macaroonBytes.length < 1 || macaroonBytes[0] !== 2) return caveats;

  let pos = 1; // skip version byte
  const bytes = macaroonBytes;

  function readVarint(): number {
    let result = 0;
    let shift = 0;
    while (pos < bytes.length) {
      const b = bytes[pos++] ?? 0;
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  }

  // Skip header: tag-2 identifier field, then EOS byte
  while (pos < bytes.length) {
    const tag = bytes[pos++];
    if (tag === 0) break; // EOS, header done
    if (tag === 6) return caveats; // signature tag, no caveats
    const len = readVarint();
    pos += len;
  }

  // Parse caveats: each is tag-2 + bytes + EOS; double-EOS or tag-6 ends list
  while (pos < bytes.length) {
    const tag = bytes[pos];
    if (tag === 0 || tag === 6) break; // EOS list or signature
    pos++;
    const len = readVarint();
    const fieldBytes = bytes.slice(pos, pos + len);
    pos += len;
    if (bytes[pos] === 0) pos++; // consume EOS after caveat
    if (tag === 2) {
      const text = dec.decode(fieldBytes);
      try {
        const parsed = parseCaveat(text);
        caveats.push({ raw: fieldBytes, condition: parsed.condition, value: parsed.value });
      } catch {
        caveats.push({ raw: fieldBytes, condition: text, value: "" });
      }
    }
  }

  return caveats;
}

/**
 * Build MacaroonSegments from a base64 macaroon for the stripe.
 * Since decodeIdentifier gives us the v0 identifier (66 bytes),
 * we build the identifier bytes from it.
 */
function buildStripeSegments(
  macaroon: string,
  id: MacaroonIdentifierV0,
  caveats: Array<{ raw: Uint8Array; condition: string; value: string }>,
  sigBytes: Uint8Array,
): MacaroonSegments {
  // Reconstruct 66-byte v0 identifier
  const identBytes = new Uint8Array(66);
  identBytes[0] = 0;
  identBytes[1] = 0;
  identBytes.set(id.paymentHash, 2);
  identBytes.set(id.tokenId, 34);

  return {
    identifier: identBytes,
    location: "",
    caveats,
    signature: sigBytes,
  };
}

export function ParseToken() {
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
    id: MacaroonIdentifierV0;
    caveats: Array<{ raw: Uint8Array; condition: string; value: string }>;
    sigBytes: Uint8Array;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function parse() {
    if (!(token ?? "").trim()) {
      setError("Paste a base64-encoded macaroon.");
      setParseResult(null);
      return;
    }
    try {
      const id = decodeIdentifier((token ?? "").trim());
      const macBytes = base64ToBytes((token ?? "").trim());
      const caveats = extractRawCaveats(macBytes);
      // Last 32 bytes of V2 binary = signature (after tag 0x03)
      const sigBytes =
        macBytes.length >= 33 ? macBytes.slice(macBytes.length - 32) : new Uint8Array(32);
      setParseResult({ id, caveats, sigBytes });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setParseResult(null);
    }
  }

  function reset() {
    setToken(null);
    setParseResult(null);
    setError(null);
  }

  const status = error ? "fail" : parseResult ? "pass" : "idle";
  const statusLabel = error ? "error" : parseResult ? "decoded" : "idle";
  const activeView = (viewMode as ViewModeValue) || "raw";
  const tokenLiteral = JSON.stringify((token ?? "").trim() || "<base64 macaroon>");

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
            Base64-encoded macaroon
            <textarea
              value={token ?? ""}
              onChange={(e) => {
                setToken(e.target.value);
                setParseResult(null);
                setError(null);
              }}
              placeholder="AGIAJEemVQUTEyNCR0exk7ek90Cg=="
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
                  <span>{parseResult.id.version}</span>
                  <span style={{ color: "var(--color-dim)" }}>paymentHash</span>
                  <span data-testid="parse-token-payment-hash" style={{ wordBreak: "break-all" }}>
                    {bytesToHex(parseResult.id.paymentHash)}
                  </span>
                  <span style={{ color: "var(--color-dim)" }}>tokenId</span>
                  <span data-testid="parse-token-token-id" style={{ wordBreak: "break-all" }}>
                    {bytesToHex(parseResult.id.tokenId)}
                  </span>
                  <span style={{ color: "var(--color-dim)" }}>caveats</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {parseResult.caveats.length === 0 ? (
                      <span style={{ color: "var(--color-dim)" }}>none</span>
                    ) : (
                      parseResult.caveats.map((c, i) => (
                        <CaveatPill key={i} state="unsatisfied">
                          {c.condition}={c.value}
                        </CaveatPill>
                      ))
                    )}
                  </div>
                  <span style={{ color: "var(--color-dim)" }}>signature</span>
                  <span data-testid="parse-token-signature" style={{ wordBreak: "break-all" }}>
                    {bytesToHex(parseResult.sigBytes)}
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
                      version: parseResult.id.version,
                      paymentHash: bytesToHex(parseResult.id.paymentHash),
                      tokenId: bytesToHex(parseResult.id.tokenId),
                      caveats: parseResult.caveats.map((c) => ({
                        condition: c.condition,
                        value: c.value,
                      })),
                      signature: bytesToHex(parseResult.sigBytes),
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
              {activeView === "stripe" && (
                <MacaroonStripe
                  segments={buildStripeSegments(
                    token ?? "",
                    parseResult.id,
                    parseResult.caveats,
                    parseResult.sigBytes,
                  )}
                />
              )}
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          contract="current-input"
          template={`import { decodeIdentifier } from "@boltwall/l402";\n\nconst macaroon = {{tokenLiteral}};\nconst id = decodeIdentifier(macaroon);\n// -> { version: 0, paymentHash: Uint8Array, tokenId: Uint8Array }`}
          values={{
            tokenLiteral,
          }}
        />
      }
    />
  );
}

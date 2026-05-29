"use client";

import { decodeBolt11Invoice, mintMacaroon, type MacaroonIdentifierV0 } from "@boltwall/l402";
import { useEffect, useState } from "react";

import { useRememberedStringInput, useUrlInput, useWorkbenchMemory } from "../../lib/url-state";
import { BigBlob } from "../ui/big-blob";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

import { panelInputStyle } from "./panel-styles";

const PANEL = "from-invoice";
const MISSING_KEY_ERROR = "Paste a 64-char hex root key.";
const INVALID_KEY_ERROR = "Root key must be exactly 64 hex characters (32 bytes).";

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.trim().toLowerCase();
  if (cleaned.length % 2 !== 0) throw new Error("Odd-length hex");
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const b = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    if (isNaN(b)) throw new Error("Invalid hex char");
    bytes[i] = b;
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function GenerateL402Token() {
  const workbenchMemory = useWorkbenchMemory();
  const [key, setKey] = useRememberedStringInput("key", {
    panel: PANEL,
    field: "signingKey",
  });

  const [invoice, setInvoice] = useUrlInput<string>(
    "invoice",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );

  const [macaroon, setMacaroon] = useState<string | null>(null);
  const [mintedIdentifier, setMintedIdentifier] = useState<{
    paymentHashHex: string;
    tokenIdHex: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const keyError = error === MISSING_KEY_ERROR || error === INVALID_KEY_ERROR;
    if (keyError && /^[0-9a-fA-F]{64}$/.test((key ?? "").trim())) {
      setError(null);
    }
  }, [error, key]);

  function generate() {
    if (!(key ?? "").trim()) {
      setError(MISSING_KEY_ERROR);
      setMacaroon(null);
      return;
    }
    if (!/^[0-9a-fA-F]{64}$/.test((key ?? "").trim())) {
      setError(INVALID_KEY_ERROR);
      setMacaroon(null);
      return;
    }

    try {
      const rootKey = hexToBytes((key ?? "").trim());

      // Parse invoice payment hash if provided, otherwise generate random 32 bytes
      let paymentHash: Uint8Array;
      if ((invoice ?? "").trim()) {
        const decoded = decodeBolt11Invoice((invoice ?? "").trim());
        paymentHash = decoded.paymentHash;
      } else {
        paymentHash = new Uint8Array(32);
        crypto.getRandomValues(paymentHash);
      }

      const tokenId = new Uint8Array(32);
      crypto.getRandomValues(tokenId);

      const identifier: MacaroonIdentifierV0 = {
        version: 0,
        paymentHash,
        tokenId,
      };

      const result = mintMacaroon({ rootKey, identifier });
      setKey((key ?? "").trim());
      setMacaroon(result);
      setMintedIdentifier({
        paymentHashHex: bytesToHex(paymentHash),
        tokenIdHex: bytesToHex(tokenId),
      });
      workbenchMemory?.setMacaroon(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMacaroon(null);
      setMintedIdentifier(null);
    }
  }

  function reset() {
    setKey(null);
    setInvoice(null);
    setMacaroon(null);
    setMintedIdentifier(null);
    workbenchMemory?.setMacaroon(null);
    setError(null);
  }

  const status = error ? "fail" : macaroon ? "pass" : "idle";
  const statusLabel = error ? "error" : macaroon ? "minted" : "idle";
  const keyLiteral = JSON.stringify((key ?? "").trim() || "<64-char hex key>");
  const invoiceLiteral = JSON.stringify((invoice ?? "").trim());
  const paymentHashLiteral = JSON.stringify(mintedIdentifier?.paymentHashHex ?? "");
  const tokenIdLiteral = JSON.stringify(mintedIdentifier?.tokenIdHex ?? "");
  const hasExactMintSnippet = Boolean(macaroon && mintedIdentifier);

  return (
    <Cell
      header={
        <HeaderRow
          title="Generate Macaroon"
          subtitle="Mint bare macaroon material from a root key and optional invoice hash"
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
            Root key (64-char hex)
            <input
              type="text"
              value={key ?? ""}
              onChange={(e) => {
                setKey(e.target.value);
                setMacaroon(null);
                setMintedIdentifier(null);
                workbenchMemory?.setMacaroon(null);
                setError(null);
              }}
              placeholder="000102030405..."
              data-testid="generate-token-key-input"
              style={{
                ...panelInputStyle(Boolean(error)),
              }}
            />
          </label>

          <label
            style={{
              fontSize: "var(--size-12)",
              color: "var(--color-dim)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            BOLT 11 invoice{" "}
            <span style={{ fontWeight: 400 }}>
              (optional; a challenge pairs the macaroon with an invoice)
            </span>
            <input
              type="text"
              value={invoice ?? ""}
              onChange={(e) => {
                setInvoice(e.target.value);
                setMacaroon(null);
                setMintedIdentifier(null);
                workbenchMemory?.setMacaroon(null);
                setError(null);
              }}
              placeholder="lnbc1500n1..."
              data-testid="generate-token-invoice-input"
              style={{
                ...panelInputStyle(Boolean(error)),
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={generate}
              data-testid="generate-token-mint"
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
              Mint
            </button>
            <button
              type="button"
              onClick={reset}
              data-testid="generate-token-reset"
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
              data-testid="generate-token-error"
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-danger)",
              }}
            >
              {error}
            </div>
          ) : null}

          {macaroon ? (
            <div data-testid="generate-token-output">
              <BigBlob value={macaroon} label="Generated macaroon" />
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          contract={hasExactMintSnippet ? "exact" : "recipe"}
          template={
            hasExactMintSnippet
              ? `import { mintMacaroon } from "@boltwall/l402";\n\nfunction hexToBytes(hex: string): Uint8Array {\n  const bytes = new Uint8Array(hex.length / 2);\n  for (let i = 0; i < bytes.length; i++) {\n    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);\n  }\n  return bytes;\n}\n\nconst rootKey = hexToBytes({{keyLiteral}});\nconst identifier = {\n  version: 0 as const,\n  paymentHash: hexToBytes({{paymentHashLiteral}}),\n  tokenId: hexToBytes({{tokenIdLiteral}}),\n};\nconst macaroon = mintMacaroon({ rootKey, identifier });`
              : `import { decodeBolt11Invoice, mintMacaroon } from "@boltwall/l402";\n\nfunction hexToBytes(hex: string): Uint8Array {\n  const bytes = new Uint8Array(hex.length / 2);\n  for (let i = 0; i < bytes.length; i++) {\n    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);\n  }\n  return bytes;\n}\n\nconst rootKey = hexToBytes({{keyLiteral}});\nconst invoice = {{invoiceLiteral}};\nconst paymentHash = invoice\n  ? decodeBolt11Invoice(invoice).paymentHash\n  : crypto.getRandomValues(new Uint8Array(32));\n\nconst identifier = {\n  version: 0 as const,\n  paymentHash,\n  tokenId: crypto.getRandomValues(new Uint8Array(32)),\n};\nconst macaroon = mintMacaroon({ rootKey, identifier });`
          }
          values={{
            keyLiteral,
            invoiceLiteral,
            paymentHashLiteral,
            tokenIdLiteral,
          }}
        />
      }
    />
  );
}

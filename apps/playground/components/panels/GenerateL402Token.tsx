"use client";

import {
  decodeBolt11Invoice,
  mintMacaroon,
  parseCaveat,
  type Caveat,
  type MacaroonIdentifierV0,
} from "@boltwall/l402";
import { useState } from "react";

import { useUrlInput } from "../../lib/url-state";
import { BigBlob } from "../ui/big-blob";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

const PANEL = "from-invoice";

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
  const [key, setKey] = useUrlInput<string>(
    "key",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );

  const [invoice, setInvoice] = useUrlInput<string>(
    "invoice",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );

  const [macaroon, setMacaroon] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    if (!(key ?? "").trim()) {
      setError("Paste a 64-char hex root key.");
      setMacaroon(null);
      return;
    }
    if (!/^[0-9a-fA-F]{64}$/.test((key ?? "").trim())) {
      setError("Root key must be exactly 64 hex characters (32 bytes).");
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
      setMacaroon(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMacaroon(null);
    }
  }

  function reset() {
    setKey(null);
    setInvoice(null);
    setMacaroon(null);
    setError(null);
  }

  const status = error ? "fail" : macaroon ? "pass" : "idle";
  const statusLabel = error ? "error" : macaroon ? "minted" : "idle";

  return (
    <Cell
      header={
        <HeaderRow
          title="Generate L402 Token"
          subtitle="Mint a macaroon from a root key and BOLT 11 invoice"
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
            Root key (64-char hex)
            <input
              type="text"
              value={key ?? ""}
              onChange={(e) => {
                setKey(e.target.value);
                setMacaroon(null);
                setError(null);
              }}
              placeholder="000102030405..."
              data-testid="generate-token-key-input"
              style={{
                padding: "6px 10px",
                background: "var(--color-surface-alt)",
                border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`,
                borderRadius: 4,
                fontSize: "var(--size-13)",
                color: "var(--color-text)",
                fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
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
              (optional; leaves a random payment hash if empty)
            </span>
            <input
              type="text"
              value={invoice ?? ""}
              onChange={(e) => {
                setInvoice(e.target.value);
                setMacaroon(null);
                setError(null);
              }}
              placeholder="lnbc1500n1..."
              data-testid="generate-token-invoice-input"
              style={{
                padding: "6px 10px",
                background: "var(--color-surface-alt)",
                border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`,
                borderRadius: 4,
                fontSize: "var(--size-13)",
                color: "var(--color-text)",
                fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
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
              <BigBlob value={macaroon} />
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          template={`import { mintMacaroon } from "@boltwall/l402";\n\nconst rootKey = hexToBytes("{{key}}");\nconst identifier = {\n  version: 0 as const,\n  paymentHash: /* from invoice */ new Uint8Array(32),\n  tokenId: crypto.getRandomValues(new Uint8Array(32)),\n};\nconst macaroon = mintMacaroon({ rootKey, identifier });`}
          values={{
            key: key ? (key.length > 40 ? key.slice(0, 40) + "..." : key) : "<64-char hex key>",
          }}
        />
      }
    />
  );
}

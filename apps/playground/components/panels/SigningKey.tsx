"use client";

import { useState } from "react";

import { useUrlInput } from "../../lib/url-state";
import { BigBlob } from "../ui/big-blob";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

const PANEL = "signing-key";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function SigningKey() {
  const [key, setKey] = useUrlInput<string>(
    "key",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );

  const [error, setError] = useState<string | null>(null);

  function generate() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    setKey(bytesToHex(bytes));
    setError(null);
  }

  function handlePaste(v: string) {
    const hex = v.trim().toLowerCase();
    if (hex.length > 0 && !/^[0-9a-f]{64}$/.test(hex)) {
      setError("Key must be exactly 64 hex characters (32 bytes).");
    } else {
      setError(null);
    }
    setKey(hex);
  }

  function reset() {
    setKey(null);
    setError(null);
  }

  const hasKey = (key ?? "").length === 64;
  const status = error ? "fail" : hasKey ? "pass" : "idle";
  const statusLabel = error ? "error" : hasKey ? "ready" : "idle";

  return (
    <Cell
      header={
        <HeaderRow
          title="Signing Key"
          subtitle="32-byte root key for macaroon HMAC chain"
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
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={generate}
              data-testid="signing-key-generate"
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
              Generate
            </button>
            <button
              type="button"
              onClick={reset}
              data-testid="signing-key-reset"
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

          <label
            style={{
              fontSize: "var(--size-12)",
              color: "var(--color-dim)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            Or paste a 64-char hex key
            <input
              type="text"
              value={key ?? ""}
              onChange={(e) => handlePaste(e.target.value)}
              placeholder="e.g. 000102030405060708..."
              data-testid="signing-key-input"
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

          {error ? (
            <div
              data-testid="signing-key-error"
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-danger)",
              }}
            >
              {error}
            </div>
          ) : null}

          {hasKey ? (
            <div data-testid="signing-key-output">
              <BigBlob value={key ?? ""} />
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          template={`// 32-byte root key (hex)\nconst rootKeyHex = "{{key}}";\nconst rootKey = Uint8Array.from(\n  rootKeyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))\n);`}
          values={{ key: hasKey ? (key ?? "") : "<32-byte hex key>" }}
        />
      }
    />
  );
}

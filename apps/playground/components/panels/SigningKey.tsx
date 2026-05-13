"use client";

import { useState } from "react";

import { useRememberedStringInput } from "../../lib/url-state";
import { BigBlob } from "../ui/big-blob";
import { Cell } from "../ui/cell";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

import { panelInputStyle } from "./panel-styles";

const PANEL = "signing-key";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function SigningKey() {
  const [key, setKey] = useRememberedStringInput("key", {
    panel: PANEL,
    field: "signingKey",
  });

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
                ...panelInputStyle(Boolean(error)),
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
              <BigBlob value={key ?? ""} label="Generated signing key" />
            </div>
          ) : null}
        </div>
      }
    />
  );
}

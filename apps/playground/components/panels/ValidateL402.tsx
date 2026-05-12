"use client";

import {
  decodeIdentifier,
  verifyMacaroon,
  verifyPreimage,
  InMemoryRootKeyStore,
  validUntilSatisfier,
  type VerifyMacaroonResult,
} from "@boltwall/l402";
import { useState } from "react";

import { useUrlInput } from "../../lib/url-state";
import { CaveatPill } from "../ui/caveat-pill";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { MacaroonStripe, type MacaroonSegments } from "../ui/macaroon-stripe";
import { StatusPill } from "../ui/status-pill";

const PANEL = "validate";

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

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

type CheckItem = {
  label: string;
  pass: boolean;
  detail?: string;
};

export function ValidateL402() {
  const [token, setToken] = useUrlInput<string>(
    "token",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );

  const [rootKeyHex, setRootKeyHex] = useUrlInput<string>(
    "key",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );

  const [preimageHex, setPreimageHex] = useUrlInput<string>(
    "preimage",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );

  const [checks, setChecks] = useState<CheckItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tampered, setTampered] = useState(false);
  const [tamperedToken, setTamperedToken] = useState<string | null>(null);

  async function runVerify(overrideToken?: string) {
    const mac = overrideToken ?? (token ?? "").trim();
    if (!mac) {
      setError("Paste a base64-encoded macaroon.");
      setChecks(null);
      return;
    }
    if (!(rootKeyHex ?? "").trim() || !/^[0-9a-fA-F]{64}$/.test((rootKeyHex ?? "").trim())) {
      setError("Root key must be 64 hex chars.");
      setChecks(null);
      return;
    }
    if (!(preimageHex ?? "").trim() || !/^[0-9a-fA-F]{64}$/.test((preimageHex ?? "").trim())) {
      setError("Preimage must be 64 hex chars.");
      setChecks(null);
      return;
    }

    const newChecks: CheckItem[] = [];

    // Step 1: decode identifier
    let tokenId: Uint8Array;
    let paymentHash: Uint8Array;
    try {
      const id = decodeIdentifier(mac);
      tokenId = id.tokenId;
      paymentHash = id.paymentHash;
      newChecks.push({
        label: "Identifier decoded",
        pass: true,
        detail: `v${id.version} / tokenId: ${bytesToHex(tokenId).slice(0, 16)}...`,
      });
    } catch (e) {
      newChecks.push({
        label: "Identifier decoded",
        pass: false,
        detail: e instanceof Error ? e.message : String(e),
      });
      setChecks(newChecks);
      setError(null);
      return;
    }

    // Step 2: preimage check
    try {
      const preimageOk = verifyPreimage({
        paymentHash,
        preimage: (preimageHex ?? "").trim(),
      });
      newChecks.push({
        label: "Preimage matches paymentHash",
        pass: preimageOk,
        ...(preimageOk ? {} : { detail: "sha256(preimage) != paymentHash" }),
      });
    } catch (e) {
      newChecks.push({
        label: "Preimage matches paymentHash",
        pass: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    // Step 3: full macaroon verification
    try {
      const rootKey = hexToBytes((rootKeyHex ?? "").trim());
      const store = new InMemoryRootKeyStore();
      await store.put(tokenId, rootKey);

      const result: VerifyMacaroonResult = await verifyMacaroon({
        macaroons: [mac],
        preimage: (preimageHex ?? "").trim(),
        rootKeyStore: store,
        satisfiers: [validUntilSatisfier()],
        context: { now: new Date() },
      });

      newChecks.push({
        label: "Macaroon signature valid",
        pass: result.ok,
        ...(result.ok ? {} : { detail: result.reason }),
      });
    } catch (e) {
      newChecks.push({
        label: "Macaroon signature valid",
        pass: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    setChecks(newChecks);
    setError(null);
  }

  function handleTamper() {
    // Flip the last byte of the base64 to invalidate the signature
    const t = (token ?? "").trim();
    if (!t) return;
    const bytes = Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
    if (bytes.length >= 1) {
      bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
    }
    const newB64 = btoa(String.fromCharCode(...bytes));
    setTamperedToken(newB64);
    setTampered(true);
    setChecks(null);
    runVerify(newB64);
  }

  function reset() {
    setToken(null);
    setRootKeyHex(null);
    setPreimageHex(null);
    setChecks(null);
    setError(null);
    setTampered(false);
    setTamperedToken(null);
  }

  const allPass = checks?.every((c) => c.pass) ?? false;
  const status = error ? "fail" : checks ? (allPass ? "pass" : "fail") : "idle";
  const statusLabel = error ? "error" : checks ? (allPass ? "valid" : "invalid") : "idle";

  return (
    <Cell
      header={
        <HeaderRow
          title="Validate L402"
          subtitle="Full macaroon verification: signature + preimage + caveats"
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
            Macaroon (base64)
            <textarea
              value={tampered && tamperedToken ? tamperedToken : (token ?? "")}
              onChange={(e) => {
                setToken(e.target.value);
                setTampered(false);
                setTamperedToken(null);
                setChecks(null);
                setError(null);
              }}
              placeholder="AGIAJEemVQUTEyNCR0exk7ek90Cg=="
              data-testid="validate-token-input"
              rows={2}
              style={{
                padding: "6px 10px",
                background: tampered ? "var(--color-danger-soft)" : "var(--color-surface-alt)",
                border: `1px solid ${tampered ? "var(--color-danger)" : error ? "var(--color-danger)" : "var(--color-border)"}`,
                borderRadius: 4,
                fontSize: "var(--size-12-5)",
                color: "var(--color-text)",
                fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                resize: "vertical",
              }}
            />
            {tampered ? (
              <span
                style={{
                  fontSize: "var(--size-11)",
                  color: "var(--color-danger)",
                }}
              >
                Token tampered; last byte flipped
              </span>
            ) : null}
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
            Root key (64-char hex)
            <input
              type="text"
              value={rootKeyHex ?? ""}
              onChange={(e) => {
                setRootKeyHex(e.target.value);
                setChecks(null);
                setError(null);
              }}
              placeholder="000102030405..."
              data-testid="validate-key-input"
              style={{
                padding: "6px 10px",
                background: "var(--color-surface-alt)",
                border: "1px solid var(--color-border)",
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
            Preimage (64-char hex)
            <input
              type="text"
              value={preimageHex ?? ""}
              onChange={(e) => {
                setPreimageHex(e.target.value);
                setChecks(null);
                setError(null);
              }}
              placeholder="0000000000000000..."
              data-testid="validate-preimage-input"
              style={{
                padding: "6px 10px",
                background: "var(--color-surface-alt)",
                border: "1px solid var(--color-border)",
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
              onClick={() => runVerify()}
              data-testid="validate-verify"
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
              Verify
            </button>
            <button
              type="button"
              onClick={handleTamper}
              data-testid="validate-tamper"
              style={{
                padding: "6px 12px",
                background: "var(--color-danger-soft)",
                color: "var(--color-danger)",
                border: "1px solid var(--color-danger)",
                borderRadius: 4,
                fontSize: "var(--size-13)",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Tamper
            </button>
            <button
              type="button"
              onClick={reset}
              data-testid="validate-reset"
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
              data-testid="validate-error"
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-danger)",
              }}
            >
              {error}
            </div>
          ) : null}

          {checks ? (
            <div
              data-testid="validate-output"
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {checks.map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "8px 12px",
                    background: c.pass ? "var(--color-accent-soft)" : "var(--color-danger-soft)",
                    border: `1px solid ${c.pass ? "var(--color-accent)" : "var(--color-danger)"}`,
                    borderRadius: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: "var(--size-16)",
                      lineHeight: 1,
                      marginTop: 1,
                    }}
                  >
                    {c.pass ? "OK" : "FAIL"}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span
                      style={{
                        fontSize: "var(--size-13)",
                        fontWeight: 500,
                        color: c.pass ? "var(--color-accent)" : "var(--color-danger)",
                      }}
                    >
                      {c.label}
                    </span>
                    {c.detail ? (
                      <span
                        style={{
                          fontSize: "var(--size-12)",
                          color: "var(--color-dim)",
                          fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                        }}
                      >
                        {c.detail}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          template={`import { verifyMacaroon, InMemoryRootKeyStore, validUntilSatisfier } from "@boltwall/l402";\n\nconst store = new InMemoryRootKeyStore();\nawait store.put(tokenId, rootKey);\n\nconst result = await verifyMacaroon({\n  macaroons: ["{{token}}"],\n  preimage: "{{preimage}}",\n  rootKeyStore: store,\n  satisfiers: [validUntilSatisfier()],\n  context: { now: new Date() },\n});\n// -> { ok: true } or { ok: false, reason: "..." }`}
          values={{
            token: token
              ? token.length > 30
                ? token.slice(0, 30) + "..."
                : token
              : "<base64 macaroon>",
            preimage: preimageHex ? (preimageHex ?? "").slice(0, 16) + "..." : "<64-char hex>",
          }}
        />
      }
    />
  );
}

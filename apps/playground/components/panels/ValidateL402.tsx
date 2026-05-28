"use client";

import {
  decodeIdentifier,
  parseAuthorizationHeader,
  verifyMacaroon,
  verifyPreimage,
  InMemoryRootKeyStore,
  validUntilSatisfier,
  type VerifyMacaroonResult,
} from "@boltwall/l402";
import { useState } from "react";

import { useRememberedStringInput, useUrlInput, useWorkbenchMemory } from "../../lib/url-state";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

import { panelInputStyle, panelTextareaStyle } from "./panel-styles";

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

function normalizeAuthorizationInput(input: string): string {
  return input.replace(/^Authorization:\s*/i, "").trim();
}

function extractCredentialInput(input: string): {
  macaroons: string[];
  preimage: string | null;
  source: "macaroon" | "credential";
} {
  const trimmed = input.trim();
  if (!trimmed) return { macaroons: [], preimage: null, source: "macaroon" };

  try {
    const parsed = parseAuthorizationHeader(normalizeAuthorizationInput(trimmed));
    return { macaroons: parsed.macaroons, preimage: parsed.preimage || null, source: "credential" };
  } catch {
    return { macaroons: [trimmed], preimage: null, source: "macaroon" };
  }
}

export function ValidateL402() {
  const workbenchMemory = useWorkbenchMemory();
  const [token, setToken] = useRememberedStringInput("token", {
    panel: PANEL,
    field: "macaroon",
  });

  const [rootKeyHex, setRootKeyHex] = useRememberedStringInput("key", {
    panel: PANEL,
    field: "signingKey",
  });

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
    const rawTokenInput =
      (overrideToken ?? (token ?? "").trim()) || workbenchMemory?.credential.trim() || "";
    const credentialInput = extractCredentialInput(rawTokenInput);
    const macaroons = credentialInput.macaroons;
    const preimage = credentialInput.preimage ?? (preimageHex ?? "").trim();
    const mac = macaroons[0] ?? "";
    if (!mac) {
      setError("Paste a base64-encoded macaroon or full Authorization credential.");
      setChecks(null);
      return;
    }
    if (!preimage || !/^[0-9a-fA-F]{64}$/.test(preimage)) {
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
        preimage,
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

    const rootKey = (rootKeyHex ?? "").trim();
    if (!rootKey || !/^[0-9a-fA-F]{64}$/.test(rootKey)) {
      if (credentialInput.source !== "credential") {
        setError("Root key must be 64 hex chars.");
        setChecks(null);
        return;
      }
      newChecks.push({
        label: "Macaroon signature not checked",
        pass: true,
        detail: "Paste the minting root key to verify the macaroon signature.",
      });
      setChecks(newChecks);
      setError(null);
      return;
    }

    // Step 3: full macaroon verification
    try {
      const rootKeyBytes = hexToBytes(rootKey);
      const store = new InMemoryRootKeyStore();
      await store.put(tokenId, rootKeyBytes);

      const result: VerifyMacaroonResult = await verifyMacaroon({
        macaroons,
        preimage,
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
    const credentialInput = extractCredentialInput(
      (token ?? "").trim() || workbenchMemory?.credential.trim() || "",
    );
    const t = credentialInput.macaroons[0] ?? "";
    if (!t) return;
    const bytes = Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
    if (bytes.length >= 1) {
      bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
    }
    const newB64 = btoa(String.fromCharCode(...bytes));
    setToken(newB64);
    setTamperedToken(newB64);
    setTampered(true);
    setChecks(null);
    runVerify(newB64);
  }

  function reset() {
    setToken(null);
    workbenchMemory?.setCredential(null);
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
  const inputValue =
    tampered && tamperedToken ? tamperedToken : (token ?? "") || workbenchMemory?.credential || "";
  const extractedInput = extractCredentialInput(inputValue);
  const tokenLiteral = JSON.stringify(extractedInput.macaroons[0] ?? "<base64 macaroon>");
  const rootKeyLiteral = JSON.stringify((rootKeyHex ?? "").trim() || "<64-char hex key>");
  const preimageLiteral = JSON.stringify(
    (extractedInput.preimage ?? (preimageHex ?? "").trim()) || "<64-char hex preimage>",
  );

  return (
    <Cell
      header={
        <HeaderRow
          title="Validate L402"
          subtitle="Verify signature, preimage, and caveats"
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
            Macaroon or Authorization credential
            <textarea
              value={inputValue}
              onChange={(e) => {
                setToken(e.target.value);
                workbenchMemory?.setCredential(null);
                setTampered(false);
                setTamperedToken(null);
                setChecks(null);
                setError(null);
              }}
              placeholder="L402 AGIAJEemVQ...:<64-char preimage>"
              data-testid="validate-token-input"
              rows={2}
              style={{
                ...panelTextareaStyle(Boolean(error)),
                background: tampered ? "var(--color-danger-soft)" : "var(--color-surface)",
                border: `1px solid ${tampered ? "var(--color-danger)" : error ? "var(--color-danger)" : "var(--color-primary)"}`,
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
                ...panelInputStyle(Boolean(error)),
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
          contract="current-input"
          template={`import { decodeIdentifier, verifyMacaroon, InMemoryRootKeyStore, validUntilSatisfier } from "@boltwall/l402";\n\nfunction hexToBytes(hex: string): Uint8Array {\n  const bytes = new Uint8Array(hex.length / 2);\n  for (let i = 0; i < bytes.length; i++) {\n    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);\n  }\n  return bytes;\n}\n\nconst macaroon = {{tokenLiteral}};\nconst rootKey = hexToBytes({{rootKeyLiteral}});\nconst preimage = {{preimageLiteral}};\nconst { tokenId } = decodeIdentifier(macaroon);\n\nconst store = new InMemoryRootKeyStore();\nawait store.put(tokenId, rootKey);\n\nconst result = await verifyMacaroon({\n  macaroons: [macaroon],\n  preimage,\n  rootKeyStore: store,\n  satisfiers: [validUntilSatisfier()],\n  context: { now: new Date() },\n});\n// -> { ok: true } or { ok: false, reason: "..." }`}
          values={{
            tokenLiteral,
            rootKeyLiteral,
            preimageLiteral,
          }}
        />
      }
    />
  );
}

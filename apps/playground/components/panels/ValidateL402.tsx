"use client";

import {
  Identifier,
  InMemoryRootKeyStore,
  L402,
  validUntilSatisfier,
  verifyPreimage,
} from "@boltwall/l402";
import { useState } from "react";

import { bytesToHex, hexToBytes } from "../../lib/hex";
import { useWorkbenchMemory } from "../../lib/url-state";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { FillFromWorkbench } from "../ui/fill-from-workbench";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

import { panelInputStyle, panelTextareaStyle } from "./panel-styles";

/**
 * A check is `pass`/`fail`, or `warn` when it could not be performed (e.g. the
 * macaroon signature cannot be verified without the Workbench signing key). A
 * `warn` is NOT a pass — it must not let the overall result read as fully valid.
 */
type CheckState = "pass" | "fail" | "warn";

type CheckItem = {
  label: string;
  state: CheckState;
  detail?: string;
};

function checkVisual(state: CheckState): { badge: string; color: string; soft: string } {
  if (state === "pass") {
    return { badge: "OK", color: "var(--color-accent)", soft: "var(--color-accent-soft)" };
  }
  if (state === "warn") {
    return { badge: "SKIPPED", color: "var(--color-warn)", soft: "var(--color-warn-soft)" };
  }
  return { badge: "FAIL", color: "var(--color-danger)", soft: "var(--color-danger-soft)" };
}

function normalizeAuthorizationInput(input: string): string {
  return input.replace(/^Authorization:\s*/i, "").trim();
}

function isCredentialLikeInput(input: string): boolean {
  const normalized = normalizeAuthorizationInput(input);
  return /^(L402|LSAT)\s+/i.test(normalized) && !/\bmacaroon=/i.test(normalized);
}

function extractCredentialInput(input: string): {
  token: L402 | null;
  macaroons: string[];
  preimage: string | null;
  source: "macaroon" | "credential";
} {
  const trimmed = input.trim();
  if (!trimmed) return { token: null, macaroons: [], preimage: null, source: "macaroon" };

  if (isCredentialLikeInput(trimmed)) {
    try {
      const token = L402.fromToken(normalizeAuthorizationInput(trimmed));
      return {
        token,
        macaroons: token.macaroons,
        preimage: token.paymentPreimage ?? null,
        source: "credential",
      };
    } catch (error) {
      if (error instanceof Error && error.message === "empty-macaroons") {
        return { token: null, macaroons: [], preimage: null, source: "credential" };
      }
    }
  }

  try {
    return {
      token: L402.fromMacaroon(trimmed),
      macaroons: [trimmed],
      preimage: null,
      source: "macaroon",
    };
  } catch {
    return {
      token: null,
      macaroons: [trimmed],
      preimage: null,
      source: "macaroon",
    };
  }
}

export function ValidateL402() {
  const workbenchMemory = useWorkbenchMemory();
  // Inputs are plain local state — never auto-synced to the URL or Workbench.
  // A carried value enters an input only via the explicit Fill buttons below.
  const [token, setToken] = useState<string | null>(null);
  const [preimageHex, setPreimageHex] = useState<string | null>(null);

  const [checks, setChecks] = useState<CheckItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tampered, setTampered] = useState(false);
  const [tamperedToken, setTamperedToken] = useState<string | null>(null);

  async function runVerify(overrideToken?: string) {
    const rawTokenInput = overrideToken ?? (token ?? "").trim();
    const credentialInput = extractCredentialInput(rawTokenInput);
    const credentialToken = credentialInput.token;
    const macaroons = credentialToken?.macaroons ?? credentialInput.macaroons;
    const preimage = credentialInput.preimage ?? (preimageHex ?? "").trim();
    const validPreimage = /^[0-9a-fA-F]{64}$/.test(preimage);
    const mac = macaroons[0] ?? "";
    if (!mac) {
      setError("Paste a base64-encoded macaroon or full Authorization credential.");
      setChecks(null);
      return;
    }

    const newChecks: CheckItem[] = [];

    // Step 1: decode identifier
    let tokenId: Uint8Array;
    let paymentHash: Uint8Array;
    try {
      const id = Identifier.fromMacaroon(mac);
      tokenId = id.tokenId;
      paymentHash = id.paymentHash;
      newChecks.push({
        label: "Identifier decoded",
        state: "pass",
        detail: `v${id.version} / tokenId: ${bytesToHex(tokenId).slice(0, 16)}...`,
      });
    } catch (e) {
      newChecks.push({
        label: "Identifier decoded",
        state: "fail",
        detail: e instanceof Error ? e.message : String(e),
      });
      setChecks(newChecks);
      setError(null);
      return;
    }

    // Step 2: preimage check
    if (!preimage) {
      newChecks.push({
        label: "Preimage check skipped",
        state: "warn",
        detail: "Paste a 64-char hex preimage or full credential to prove payment.",
      });
    } else if (!validPreimage) {
      newChecks.push({
        label: "Preimage check skipped",
        state: "warn",
        detail: "Preimage must be 64 hex characters before payment proof can be checked.",
      });
    } else {
      try {
        const preimageOk = verifyPreimage({
          paymentHash,
          preimage,
        });
        newChecks.push({
          label: "Preimage matches paymentHash",
          state: preimageOk ? "pass" : "fail",
          ...(preimageOk ? {} : { detail: "sha256(preimage) != paymentHash" }),
        });
      } catch (e) {
        newChecks.push({
          label: "Preimage matches paymentHash",
          state: "fail",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const rootKey = workbenchMemory?.signingKey.trim() ?? "";
    if (!rootKey || !/^[0-9a-fA-F]{64}$/.test(rootKey)) {
      newChecks.push({
        label: "Macaroon signature not checked",
        state: "warn",
        detail: rootKey
          ? "Workbench signing key must be 64 hex characters before signature checks can run."
          : "Generate or paste a signing key into Workbench to verify the macaroon signature.",
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

      const tokenToVerify = credentialToken ?? new L402({ macaroons });
      const result = await tokenToVerify.verify({
        ...(validPreimage ? { preimage } : {}),
        rootKeyStore: store,
        satisfiers: [validUntilSatisfier()],
        context: { now: new Date() },
        requirePreimage: false,
      });

      newChecks.push({
        label: "Macaroon signature and caveats valid",
        state: result.ok ? "pass" : "fail",
        ...(result.ok ? {} : { detail: result.reason }),
      });
    } catch (e) {
      newChecks.push({
        label: "Macaroon signature and caveats valid",
        state: "fail",
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    setChecks(newChecks);
    setError(null);
  }

  function handleTamper() {
    // Flip the last byte of the base64 to invalidate the signature
    const credentialInput = extractCredentialInput((token ?? "").trim());
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

  function clearPage() {
    setToken(null);
    setPreimageHex(null);
    setChecks(null);
    setError(null);
    setTampered(false);
    setTamperedToken(null);
  }

  function clearBoth() {
    clearPage();
    workbenchMemory?.setMacaroon(null);
    workbenchMemory?.setCredential(null);
    workbenchMemory?.setSigningKey(null);
  }

  function fillTokenFromWorkbench(value: string) {
    setToken(value);
    setTampered(false);
    setTamperedToken(null);
    setChecks(null);
    setError(null);
  }

  // A skipped (warn) check must not read as fully valid: without the Workbench
  // signing key the signature is unverified, so the result is "partially
  // verified", not green.
  const hasFail = checks?.some((c) => c.state === "fail") ?? false;
  const hasWarn = checks?.some((c) => c.state === "warn") ?? false;
  const status = error ? "fail" : !checks ? "idle" : hasFail ? "fail" : hasWarn ? "warn" : "pass";
  const statusLabel = error
    ? "error"
    : !checks
      ? "idle"
      : hasFail
        ? "invalid"
        : hasWarn
          ? "partially verified"
          : "valid";
  const inputValue = tampered && tamperedToken ? tamperedToken : (token ?? "");
  const extractedInput = extractCredentialInput(inputValue);
  const tokenLiteral = JSON.stringify(extractedInput.macaroons[0] ?? "<base64 macaroon>");
  const rememberedSigningKey = workbenchMemory?.signingKey.trim() ?? "";
  const rootKeyLiteral = JSON.stringify(rememberedSigningKey || "<Workbench signing key>");
  const preimageLiteral = JSON.stringify(
    (extractedInput.preimage ?? (preimageHex ?? "").trim()) || "<64-char hex preimage>",
  );
  const rememberedMacaroon = workbenchMemory?.macaroon.trim() ?? "";
  const rememberedCredential = workbenchMemory?.credential.trim() ?? "";

  return (
    <Cell
      header={
        <HeaderRow
          title="Validate L402"
          subtitle="Verify signature, preimage, and caveats"
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
            Raw macaroon or Authorization credential
            <textarea
              value={inputValue}
              onChange={(e) => {
                setToken(e.target.value);
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

          <div
            data-testid="validate-workbench-actions"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              fontSize: "var(--size-11)",
              color: "var(--color-dim)",
            }}
          >
            <span style={{ fontWeight: 600, textTransform: "uppercase" }}>Use from Workbench</span>
            <FillFromWorkbench
              label="macaroon"
              available={rememberedMacaroon}
              current={inputValue}
              onFill={fillTokenFromWorkbench}
              testId="validate-fill-macaroon"
            />
            <FillFromWorkbench
              label="credential"
              available={rememberedCredential}
              current={inputValue}
              onFill={fillTokenFromWorkbench}
              testId="validate-fill-credential"
            />
          </div>

          <div
            data-testid="validate-workbench-signing-key"
            style={{
              fontSize: "var(--size-12)",
              color: "var(--color-dim)",
              padding: "8px 10px",
              background: "var(--color-surface-alt)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
            }}
          >
            Signing key source:{" "}
            <span
              style={{ color: rememberedSigningKey ? "var(--color-text)" : "var(--color-dim)" }}
            >
              {rememberedSigningKey ? "Workbench signing key" : "not in Workbench"}
            </span>
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
              onClick={clearPage}
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
              Clear page
            </button>
            <button
              type="button"
              onClick={clearBoth}
              data-testid="validate-clear-both"
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
              {checks.map((c, i) => {
                const v = checkVisual(c.state);
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "8px 12px",
                      background: v.soft,
                      border: `1px solid ${v.color}`,
                      borderRadius: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--size-16)",
                        lineHeight: 1,
                        marginTop: 1,
                        color: v.color,
                      }}
                    >
                      {v.badge}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span
                        style={{
                          fontSize: "var(--size-13)",
                          fontWeight: 500,
                          color: v.color,
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
                );
              })}
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          contract="current-input"
          template={`import { L402, Identifier, InMemoryRootKeyStore, validUntilSatisfier } from "@boltwall/l402";\n\nfunction hexToBytes(hex: string): Uint8Array {\n  const bytes = new Uint8Array(hex.length / 2);\n  for (let i = 0; i < bytes.length; i++) {\n    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);\n  }\n  return bytes;\n}\n\nconst macaroon = {{tokenLiteral}};\nconst workbenchSigningKey = {{rootKeyLiteral}};\nconst preimage = {{preimageLiteral}};\nconst { tokenId } = Identifier.fromMacaroon(macaroon);\n\nconst store = new InMemoryRootKeyStore();\nawait store.put(tokenId, hexToBytes(workbenchSigningKey));\n\nconst token = new L402({ macaroons: [macaroon], paymentPreimage: preimage });\nconst result = await token.verify({\n  rootKeyStore: store,\n  satisfiers: [validUntilSatisfier()],\n  context: { now: new Date() },\n});\n// -> { ok: true } or { ok: false, reason: "..." }`}
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

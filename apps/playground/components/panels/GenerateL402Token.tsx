"use client";

import { decodeBolt11Invoice, L402, mintMacaroon, type MacaroonIdentifierV0 } from "@boltwall/l402";
import { useEffect, useState } from "react";

import { bytesToHex, hexToBytes } from "../../lib/hex";
import { useWorkbenchMemory } from "../../lib/url-state";
import { BigBlob } from "../ui/big-blob";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { FillFromWorkbench } from "../ui/fill-from-workbench";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

import { panelInputStyle } from "./panel-styles";

const MISSING_KEY_ERROR = "Paste a 64-char hex root key.";
const INVALID_KEY_ERROR = "Root key must be exactly 64 hex characters (32 bytes).";
const INVALID_PREIMAGE_ERROR = "Preimage must be exactly 64 hex characters (32 bytes).";
const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

export function GenerateL402Token() {
  const workbenchMemory = useWorkbenchMemory();
  // Inputs are plain local state — never auto-synced to the URL or Workbench.
  // The signing key is loaded from the Workbench via the explicit Fill button;
  // minted outputs are still written to the Workbench (Generate is a producer).
  const [key, setKey] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [preimage, setPreimage] = useState<string | null>(null);

  const [macaroon, setMacaroon] = useState<string | null>(null);
  const [mintedIdentifier, setMintedIdentifier] = useState<{
    paymentHashHex: string;
    tokenIdHex: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [credential, setCredential] = useState<string | null>(null);

  // The macaroon, identifier, challenge, and credential are all derived from the
  // current inputs; clear them together whenever an input changes or on reset.
  function clearGenerated() {
    setMacaroon(null);
    setMintedIdentifier(null);
    setChallenge(null);
    setCredential(null);
    workbenchMemory?.setMacaroon(null);
    workbenchMemory?.setChallenge(null);
    workbenchMemory?.setCredential(null);
  }

  useEffect(() => {
    const keyError = error === MISSING_KEY_ERROR || error === INVALID_KEY_ERROR;
    if (keyError && /^[0-9a-fA-F]{64}$/.test((key ?? "").trim())) {
      setError(null);
    }
  }, [error, key]);

  async function generate() {
    if (!(key ?? "").trim()) {
      setError(MISSING_KEY_ERROR);
      clearGenerated();
      return;
    }
    if (!HEX_64_RE.test((key ?? "").trim())) {
      setError(INVALID_KEY_ERROR);
      clearGenerated();
      return;
    }
    const trimmedPreimage = (preimage ?? "").trim();
    if (trimmedPreimage && !HEX_64_RE.test(trimmedPreimage)) {
      setError(INVALID_PREIMAGE_ERROR);
      clearGenerated();
      return;
    }

    try {
      const rootKey = hexToBytes((key ?? "").trim());
      const trimmedInvoice = (invoice ?? "").trim();

      // Payment-hash precedence: a preimage binds the macaroon to
      // sha256(preimage) so the resulting credential verifies in Validate;
      // otherwise use the invoice's payment hash, or a random hash when neither
      // is given. L402 protocol-specification.md §5.3 — a credential is
      // macaroon:preimage and the preimage MUST hash to the bound payment hash.
      let paymentHash: Uint8Array;
      if (trimmedPreimage) {
        // Copy into a fresh ArrayBuffer-backed view so crypto.subtle accepts it.
        const preimageBytes = new Uint8Array(32);
        preimageBytes.set(hexToBytes(trimmedPreimage));
        const digest = await crypto.subtle.digest("SHA-256", preimageBytes);
        paymentHash = new Uint8Array(digest);
      } else if (trimmedInvoice) {
        paymentHash = decodeBolt11Invoice(trimmedInvoice).paymentHash;
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

      // A bare macaroon is not yet a challenge: pairing it with the invoice
      // produces the full WWW-Authenticate value a server returns on a 402.
      // L402 protocol-specification.md §5.1 defines the challenge shape; §10
      // the dual LSAT-first / L402-second emission. Joining the two values
      // mirrors how the same header repeated on the wire is folded into one
      // comma-separated string.
      if (trimmedInvoice) {
        const challengeValue = new L402({
          macaroons: result,
          invoice: trimmedInvoice,
          paymentHash,
        })
          .toAuthenticateHeaders()
          .join(", ");
        setChallenge(challengeValue);
        workbenchMemory?.setChallenge(challengeValue);
      } else {
        setChallenge(null);
        workbenchMemory?.setChallenge(null);
      }

      // With a preimage, pair it with the macaroon to form the Authorization
      // credential (`L402 <macaroon>:<preimage>`). Because the macaroon's
      // payment hash was bound to sha256(preimage) above, this credential
      // verifies in the Validate panel with the same root key.
      if (trimmedPreimage) {
        const credentialValue = new L402({
          macaroons: result,
          paymentPreimage: trimmedPreimage,
        }).toAuthorizationHeader();
        setCredential(credentialValue);
        workbenchMemory?.setCredential(credentialValue);
      } else {
        setCredential(null);
        workbenchMemory?.setCredential(null);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMacaroon(null);
      setMintedIdentifier(null);
      setChallenge(null);
      setCredential(null);
    }
  }

  function reset() {
    setKey(null);
    setInvoice(null);
    setPreimage(null);
    clearGenerated();
    setError(null);
  }

  const status = error ? "fail" : macaroon ? "pass" : "idle";
  const statusLabel = error ? "error" : macaroon ? "minted" : "idle";
  const keyLiteral = JSON.stringify((key ?? "").trim() || "<64-char hex key>");
  const invoiceLiteral = JSON.stringify((invoice ?? "").trim());
  const preimageLiteral = JSON.stringify((preimage ?? "").trim());
  const paymentHashLiteral = JSON.stringify(mintedIdentifier?.paymentHashHex ?? "");
  const tokenIdLiteral = JSON.stringify(mintedIdentifier?.tokenIdHex ?? "");
  const hasExactMintSnippet = Boolean(macaroon && mintedIdentifier);

  const hexToBytesHelper = `function hexToBytes(hex: string): Uint8Array {\n  const bytes = new Uint8Array(hex.length / 2);\n  for (let i = 0; i < bytes.length; i++) {\n    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);\n  }\n  return bytes;\n}`;
  const exactImport =
    challenge || credential
      ? `import { L402, mintMacaroon } from "@boltwall/l402";`
      : `import { mintMacaroon } from "@boltwall/l402";`;
  const challengeTail = challenge
    ? `\n\n// Pair the macaroon with the invoice to emit the WWW-Authenticate\n// challenge (dual LSAT-first + L402, per L402 protocol-specification.md §10)\nconst challengeHeaders = new L402({\n  macaroons: macaroon,\n  invoice,\n  paymentHash: identifier.paymentHash,\n}).toAuthenticateHeaders();`
    : "";
  const credentialTail = credential
    ? `\n\n// The macaroon's payment hash was bound to sha256(preimage), so this\n// credential verifies in Validate with the same root key (L402\n// protocol-specification.md §5.3).\nconst credential = new L402({\n  macaroons: macaroon,\n  paymentPreimage: {{preimageLiteral}},\n}).toAuthorizationHeader();`
    : "";
  const exactTemplate = `${exactImport}\n\n${hexToBytesHelper}\n\nconst rootKey = hexToBytes({{keyLiteral}});\nconst invoice = {{invoiceLiteral}};\nconst identifier = {\n  version: 0 as const,\n  paymentHash: hexToBytes({{paymentHashLiteral}}),\n  tokenId: hexToBytes({{tokenIdLiteral}}),\n};\nconst macaroon = mintMacaroon({ rootKey, identifier });${challengeTail}${credentialTail}`;
  const recipeTemplate = `import { decodeBolt11Invoice, mintMacaroon } from "@boltwall/l402";\n\n${hexToBytesHelper}\n\nconst rootKey = hexToBytes({{keyLiteral}});\nconst invoice = {{invoiceLiteral}};\nconst paymentHash = invoice\n  ? decodeBolt11Invoice(invoice).paymentHash\n  : crypto.getRandomValues(new Uint8Array(32));\n\nconst identifier = {\n  version: 0 as const,\n  paymentHash,\n  tokenId: crypto.getRandomValues(new Uint8Array(32)),\n};\nconst macaroon = mintMacaroon({ rootKey, identifier });`;
  const snippetTemplate = hasExactMintSnippet ? exactTemplate : recipeTemplate;

  return (
    <Cell
      header={
        <HeaderRow
          title="Generate"
          subtitle="Mint a macaroon from a root key; add an invoice for a challenge, a preimage for a credential"
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
            Root key (64-char hex)
            <input
              type="text"
              value={key ?? ""}
              onChange={(e) => {
                setKey(e.target.value);
                clearGenerated();
                setError(null);
              }}
              placeholder="000102030405..."
              data-testid="generate-token-key-input"
              style={{
                ...panelInputStyle(Boolean(error)),
              }}
            />
          </label>

          <div
            data-testid="generate-token-workbench-actions"
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
            <FillFromWorkbench
              label="key"
              available={workbenchMemory?.signingKey ?? ""}
              current={key ?? ""}
              onFill={(value) => {
                setKey(value);
                clearGenerated();
                setError(null);
              }}
              testId="generate-token-fill-key"
            />
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
            BOLT 11 invoice{" "}
            <span style={{ fontWeight: 400 }}>
              (optional; a challenge pairs the macaroon with an invoice)
            </span>
            <input
              type="text"
              value={invoice ?? ""}
              onChange={(e) => {
                setInvoice(e.target.value);
                clearGenerated();
                setError(null);
              }}
              placeholder="lnbc1500n1..."
              data-testid="generate-token-invoice-input"
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
            Preimage (64-char hex){" "}
            <span style={{ fontWeight: 400 }}>
              (optional; binds the macaroon to sha256(preimage) so the credential verifies)
            </span>
            <input
              type="text"
              value={preimage ?? ""}
              onChange={(e) => {
                setPreimage(e.target.value);
                clearGenerated();
                setError(null);
              }}
              placeholder="00000000..."
              data-testid="generate-token-preimage-input"
              style={{
                ...panelInputStyle(Boolean(error)),
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                void generate();
              }}
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

          {challenge ? (
            <div data-testid="generate-token-challenge">
              <BigBlob value={challenge} label="WWW-Authenticate challenge" />
              <div
                style={{
                  fontSize: "var(--size-12)",
                  color: "var(--color-dim)",
                  marginTop: 4,
                }}
              >
                Stored in Workbench memory as the challenge — open From Challenge to parse it.
              </div>
            </div>
          ) : null}

          {credential ? (
            <div data-testid="generate-token-credential">
              <BigBlob value={credential} label="Authorization credential" />
              <div
                style={{
                  fontSize: "var(--size-12)",
                  color: "var(--color-dim)",
                  marginTop: 4,
                }}
              >
                Stored in Workbench memory as the credential — open Validate to verify it with this
                root key.
              </div>
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          contract={hasExactMintSnippet ? "exact" : "recipe"}
          template={snippetTemplate}
          values={{
            keyLiteral,
            invoiceLiteral,
            preimageLiteral,
            paymentHashLiteral,
            tokenIdLiteral,
          }}
        />
      }
    />
  );
}

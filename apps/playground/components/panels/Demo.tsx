"use client";

import { parseAuthenticateHeader, parseCaveat } from "@boltwall/l402";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import {
  FetchPaidResourceError,
  buildPastedCredentialParts,
  fetchPaidResource,
  parsePastedPreimage,
  parsePastedCredential,
  retryWithCredential,
  withAuthorization,
  type FetchPaidResult,
  type PaidCredential,
} from "../../lib/payment";
import { useWorkbenchMemory } from "../../lib/url-state";
import { CaveatPill } from "../ui/caveat-pill";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

const PUBLIC_POKEMON_ENDPOINT_TEMPLATE = "https://pokeapi.co/api/v2/pokemon/{id}";
const CONFIGURED_DEMO_ENDPOINT = process.env.NEXT_PUBLIC_BOLTWALL_PLAYGROUND_DEMO_ENDPOINT ?? "";
const MAX_POKEMON_ID = 1025;

interface WebLnHandle {
  enable(): Promise<unknown>;
  sendPayment(invoice: string): Promise<{ preimage: string }>;
}

type Pokemon = {
  id: number | string;
  name: string;
  type: string;
  image: string;
  raw: string;
};

type ChallengeState = {
  endpoint: string;
  endpointTemplate: string;
  rawAuthenticate: string;
  invoice: string;
  macaroon: string;
  scheme: "L402" | "LSAT";
};

type CachedCredentialState = {
  endpointTemplate: string;
  credential: PaidCredential;
};

type DemoStatus =
  | { kind: "idle" }
  | { kind: "fetching"; id: number }
  | { kind: "awaiting-payment"; id: number; challenge: ChallengeState }
  | { kind: "paying"; id: number }
  | { kind: "ok"; pokemon: Pokemon; l402Protected: boolean }
  | { kind: "error"; error: DemoError };

type DemoError = {
  title: string;
  details: string[];
};

type CapturedArtifact =
  | { kind: "challenge"; rawAuthenticate: string }
  | { kind: "credential"; outcome: "created" | "rejected"; credential: PaidCredential };

type CopyTarget = "invoice" | "challenge" | "credential";

type CaveatSummary = {
  condition: string;
  value: string;
  label: string;
  expiresAtMs: number | null;
};

function getWebLn(): WebLnHandle | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as { webln?: unknown }).webln;
  if (typeof candidate !== "object" || candidate === null) return null;
  const record = candidate as Record<string, unknown>;
  if (typeof record.enable !== "function") return null;
  if (typeof record.sendPayment !== "function") return null;
  return candidate as WebLnHandle;
}

function randomPokemonId(): number {
  return Math.floor(Math.random() * MAX_POKEMON_ID) + 1;
}

function endpointForPokemon(template: string, id: number): string {
  const trimmed = template.trim();
  if (trimmed.includes("{id}")) return trimmed.replaceAll("{id}", String(id));
  if (trimmed.includes(":id")) return trimmed.replaceAll(":id", String(id));

  try {
    const url = new URL(trimmed);
    const last = url.pathname.split("/").filter(Boolean).at(-1);
    if (last !== undefined && /^\d+$/.test(last)) {
      url.pathname = url.pathname.replace(/\/\d+\/?$/, `/${String(id)}`);
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

function pickEndpointTemplate(overrideEndpoint: string): string {
  const override = overrideEndpoint.trim();
  if (override !== "") return override;
  if (CONFIGURED_DEMO_ENDPOINT !== "") return CONFIGURED_DEMO_ENDPOINT;
  return PUBLIC_POKEMON_ENDPOINT_TEMPLATE;
}

function parsePokemon(text: string): Pokemon {
  const value = JSON.parse(text) as {
    id?: number | string;
    name?: string;
    sprites?: {
      front_default?: string | null;
      other?: { "official-artwork"?: { front_default?: string | null } };
    };
    types?: Array<{ type?: { name?: string } }>;
  };
  const name = value.name;
  const image =
    value.sprites?.front_default ?? value.sprites?.other?.["official-artwork"]?.front_default ?? "";
  const type = value.types?.[0]?.type?.name ?? "";
  if (name === undefined || name === "" || image === "" || type === "") {
    throw new Error("invalid-pokemon-response");
  }
  return {
    id: value.id ?? "unknown",
    name,
    type,
    image,
    raw: JSON.stringify(value, null, 2),
  };
}

function currentOrigin(): string {
  if (typeof window === "undefined") return "unknown origin";
  return window.location.origin;
}

function messageError(message: string): DemoError {
  return { title: message, details: [] };
}

function describeInitialFetchError(endpoint: string, error: unknown): DemoError {
  if (error instanceof FetchPaidResourceError) {
    const commonDetails = [`Endpoint: ${endpoint}`, `Playground origin: ${currentOrigin()}`];
    if (error.diagnostic.kind === "request-failed-before-readable-response") {
      return {
        title: "The playground could not read a response from the endpoint.",
        details: [
          ...commonDetails,
          "Check that the endpoint is reachable from the browser and that its CORS policy allows this playground origin.",
          "For L402 challenges, the response must also expose WWW-Authenticate so the invoice and macaroon can be shown.",
          `Fetch detail: ${error.diagnostic.message}`,
        ],
      };
    }
    if (error.diagnostic.kind === "payment-challenge-missing") {
      return {
        title:
          "The endpoint returned an L402 payment response, but no readable challenge was present.",
        details: [
          ...commonDetails,
          "Return a WWW-Authenticate header and expose it to this playground origin.",
        ],
      };
    }
    return {
      title:
        "The endpoint returned an L402 payment response, but the challenge could not be parsed.",
      details: [...commonDetails, `Parser detail: ${error.diagnostic.message}`],
    };
  }
  return messageError(error instanceof Error ? error.message : String(error));
}

export function Demo() {
  const router = useRouter();
  const workbenchMemory = useWorkbenchMemory();
  const [endpointOverride, setEndpointOverride] = useState("");
  const [webLnDetected, setWebLnDetected] = useState<boolean | null>(null);
  const [pastedPreimage, setPastedPreimage] = useState("");
  const [cachedCredential, setCachedCredential] = useState<CachedCredentialState | null>(null);
  const [customCredential, setCustomCredential] = useState<CachedCredentialState | null>(null);
  const [customAuthorization, setCustomAuthorization] = useState("");
  const [customMacaroon, setCustomMacaroon] = useState("");
  const [customPreimage, setCustomPreimage] = useState("");
  const [customScheme, setCustomScheme] = useState<"L402" | "LSAT">("L402");
  const [status, setStatus] = useState<DemoStatus>({ kind: "idle" });
  const [capturedArtifact, setCapturedArtifact] = useState<CapturedArtifact | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);

  useEffect(() => {
    setWebLnDetected(getWebLn() !== null);
  }, []);

  useEffect(() => {
    if (copiedTarget === null) return;
    const timeout = window.setTimeout(() => setCopiedTarget(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copiedTarget]);

  const endpointTemplate = useMemo(
    () => pickEndpointTemplate(endpointOverride),
    [endpointOverride],
  );
  const usingConfiguredEndpoint = endpointOverride.trim() !== "" || CONFIGURED_DEMO_ENDPOINT !== "";
  const matchingCustomCredential =
    customCredential?.endpointTemplate === endpointTemplate
      ? { ...customCredential, source: "custom" as const }
      : null;
  const matchingCachedCredential =
    cachedCredential?.endpointTemplate === endpointTemplate
      ? { ...cachedCredential, source: "paid" as const }
      : null;
  const activeCredential = matchingCustomCredential ?? matchingCachedCredential;

  async function getPokemon(useStoredCredential = true) {
    const id = randomPokemonId();
    const endpoint = endpointForPokemon(endpointTemplate, id);
    setStatus({ kind: "fetching", id });
    setPastedPreimage("");
    try {
      const active = useStoredCredential ? activeCredential : null;
      const credential = active?.credential ?? null;
      const result = await fetchPaidResource(
        endpoint,
        credential === null
          ? pokemonRequestInit()
          : withAuthorization(pokemonRequestInit(), credential),
      );
      if (credential !== null && result.status === "error" && result.response.status === 401) {
        if (credential) {
          setCapturedArtifact({
            kind: "credential",
            outcome: "rejected",
            credential,
          });
        }
        if (active?.source === "custom") {
          const text = await result.response.text();
          setStatus({
            kind: "error",
            error: {
              title: "Custom credential rejected.",
              details: [
                `Endpoint: ${endpoint}`,
                `Server response: ${String(result.response.status)} ${text}`,
                "Clear the custom credential or fetch a fresh challenge to pay again.",
              ],
            },
          });
          return;
        }
        setCachedCredential(null);
        await handleFetchResult(
          id,
          endpoint,
          await fetchPaidResource(endpoint, pokemonRequestInit()),
          false,
        );
        return;
      }
      if (credential !== null && result.status === "challenge") {
        if (active?.source === "custom") {
          setCustomCredential(null);
        } else {
          setCachedCredential(null);
        }
      }
      await handleFetchResult(id, endpoint, result, credential !== null && result.status === "ok");
    } catch (error) {
      setStatus({
        kind: "error",
        error: describeInitialFetchError(endpoint, error),
      });
    }
  }

  async function fetchFreshChallenge() {
    setCustomCredential(null);
    await getPokemon(false);
  }

  function useFullCustomCredential() {
    try {
      const credential = parsePastedCredential(customAuthorization);
      setCustomCredential({ endpointTemplate, credential });
      setCachedCredential(null);
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({
        kind: "error",
        error: messageError(error instanceof Error ? error.message : String(error)),
      });
    }
  }

  function useCustomCredentialParts() {
    try {
      const credential = buildPastedCredentialParts(customMacaroon, customPreimage, customScheme);
      setCustomCredential({ endpointTemplate, credential });
      setCachedCredential(null);
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({
        kind: "error",
        error: messageError(error instanceof Error ? error.message : String(error)),
      });
    }
  }

  function loadWorkbenchMacaroon() {
    if (!workbenchMemory?.macaroon) return;
    setCustomMacaroon(workbenchMemory.macaroon);
  }

  function clearCustomCredential() {
    setCustomCredential(null);
    setCustomAuthorization("");
    setCustomMacaroon("");
    setCustomPreimage("");
  }

  async function copyText(value: string, target: CopyTarget) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
    } catch {
      // Copy affordances are progressive enhancement; keep the flow usable.
    }
  }

  function openParseWithChallenge(rawAuthenticate: string) {
    workbenchMemory?.setChallenge(rawAuthenticate);
    router.push(`/p/parse?from-challenge.challenge=${encodeURIComponent(rawAuthenticate)}`);
  }

  function openParseWithMacaroon(macaroon: string) {
    workbenchMemory?.setMacaroon(macaroon);
    router.push(`/p/parse?parse-token.macaroon=${encodeURIComponent(macaroon)}`);
  }

  function openValidateWithCredential(credential: PaidCredential) {
    workbenchMemory?.setCredential(credential.authorization);
    router.push(`/p/validate?validate.token=${encodeURIComponent(credential.authorization)}`);
  }

  async function payWithWebLn() {
    if (status.kind !== "awaiting-payment") return;
    const webln = getWebLn();
    if (webln === null) {
      setStatus({ kind: "error", error: messageError("WebLN not detected") });
      return;
    }
    const { id, challenge } = status;
    setStatus({ kind: "paying", id });
    try {
      await webln.enable();
      const { preimage } = await webln.sendPayment(challenge.invoice);
      await retryAndRender(id, challenge, preimage);
    } catch (error) {
      setStatus({
        kind: "error",
        error: messageError(error instanceof Error ? error.message : String(error)),
      });
    }
  }

  async function submitPastedPreimage() {
    if (status.kind !== "awaiting-payment") return;
    let preimage: string;
    try {
      preimage = parsePastedPreimage(pastedPreimage);
    } catch (error) {
      setStatus({
        kind: "error",
        error: messageError(error instanceof Error ? error.message : String(error)),
      });
      return;
    }
    const { id, challenge } = status;
    setStatus({ kind: "paying", id });
    try {
      await retryAndRender(id, challenge, preimage);
    } catch (error) {
      setStatus({
        kind: "error",
        error: messageError(error instanceof Error ? error.message : String(error)),
      });
    }
  }

  async function retryAndRender(id: number, challenge: ChallengeState, preimage: string) {
    const result = await retryWithCredential(
      challenge.endpoint,
      { headers: { accept: "application/json" }, cache: "no-store" },
      challenge,
      preimage,
    );
    if (result.status === "paid") {
      setCapturedArtifact({
        kind: "credential",
        outcome: "created",
        credential: result.credential,
      });
      setCachedCredential({
        endpointTemplate: challenge.endpointTemplate,
        credential: result.credential,
      });
      const text = await result.response.text();
      setStatus({
        kind: "ok",
        pokemon: parsePokemon(text),
        l402Protected: true,
      });
      return;
    }
    const text = await result.response.text();
    setCapturedArtifact({
      kind: "credential",
      outcome: "rejected",
      credential: result.credential,
    });
    setStatus({
      kind: "error",
      error: messageError(`retry returned ${String(result.response.status)}: ${text}`),
    });
  }

  async function handleFetchResult(
    id: number,
    endpoint: string,
    result: FetchPaidResult,
    usedCredential: boolean,
  ) {
    if (result.status === "ok") {
      const text = await result.response.text();
      setStatus({
        kind: "ok",
        pokemon: parsePokemon(text),
        l402Protected: usedCredential,
      });
      return;
    }
    if (result.status === "error") {
      const text = await result.response.text();
      setStatus({
        kind: "error",
        error: messageError(`request failed ${String(result.response.status)}: ${text}`),
      });
      return;
    }
    setWebLnDetected(getWebLn() !== null);
    setCapturedArtifact({
      kind: "challenge",
      rawAuthenticate: result.challenge.rawAuthenticate,
    });
    setStatus({
      kind: "awaiting-payment",
      id,
      challenge: {
        endpoint,
        endpointTemplate,
        rawAuthenticate: result.challenge.rawAuthenticate,
        invoice: result.challenge.invoice,
        macaroon: result.challenge.macaroon,
        scheme: result.challenge.scheme,
      },
    });
  }

  const busy = status.kind === "fetching" || status.kind === "paying";
  const statusState =
    status.kind === "error"
      ? "fail"
      : status.kind === "ok"
        ? status.l402Protected
          ? "pass"
          : "warn"
        : status.kind === "awaiting-payment"
          ? "warn"
          : "idle";
  const statusLabel =
    status.kind === "idle"
      ? "ready to fetch"
      : status.kind === "fetching"
        ? "fetching"
        : status.kind === "awaiting-payment"
          ? "L402 payment"
          : status.kind === "paying"
            ? "paying"
            : status.kind === "ok"
              ? status.l402Protected
                ? "loaded"
                : "unprotected"
              : "error";
  const challenge = status.kind === "awaiting-payment" ? status.challenge : undefined;
  const challengePokemonId = status.kind === "awaiting-payment" ? status.id : undefined;
  const pasteDisabled = pastedPreimage.trim() === "" || busy;
  const weblnDisabled = webLnDetected === false || busy;

  return (
    <Cell
      header={
        <HeaderRow
          title="Demo"
          subtitle="Fetch a random Pokemon, then pay and retry when the endpoint is protected"
          trailing={
            <StatusPill
              state={statusState}
              details={status.kind === "error" ? status.error.title : null}
            >
              {statusLabel}
            </StatusPill>
          }
        />
      }
      body={
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <button
            type="button"
            onClick={() => {
              void getPokemon();
            }}
            disabled={busy}
            data-testid="demo-get-pokemon"
            style={{
              padding: "9px 16px",
              background: "var(--color-primary)",
              color: "var(--color-surface)",
              border: "none",
              borderRadius: 4,
              fontSize: "var(--size-13)",
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
              alignSelf: "flex-start",
              order: 0,
            }}
          >
            {busy ? "Loading..." : "Get Random Pokemon"}
          </button>

          <details data-testid="demo-endpoint-settings" style={{ order: 30 }}>
            <summary
              style={{
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                padding: "5px 0",
                fontSize: "var(--size-13)",
                color: "var(--color-text)",
                fontWeight: 600,
              }}
            >
              Use a different endpoint
            </summary>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginTop: 8,
                fontSize: "var(--size-12)",
                color: "var(--color-dim)",
              }}
            >
              Endpoint URL
              <input
                type="url"
                value={endpointOverride}
                placeholder={CONFIGURED_DEMO_ENDPOINT || PUBLIC_POKEMON_ENDPOINT_TEMPLATE}
                onChange={(event) => {
                  setEndpointOverride(event.target.value);
                  setCachedCredential(null);
                  setCustomCredential(null);
                }}
                data-testid="demo-endpoint-input"
                style={{
                  width: "100%",
                  minWidth: 0,
                  padding: "8px 10px",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 4,
                  color: "var(--color-text)",
                  fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                  fontSize: "var(--size-12)",
                }}
              />
            </label>
          </details>

          {usingConfiguredEndpoint ? (
            <div
              data-testid="demo-active-endpoint"
              style={{
                color: "var(--color-dim)",
                fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                fontSize: "var(--size-12)",
                wordBreak: "break-all",
                order: 29,
              }}
            >
              {endpointTemplate}
            </div>
          ) : null}

          <details data-testid="demo-custom-credential" style={{ order: 31 }}>
            <summary
              style={{
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                padding: "5px 0",
                fontSize: "var(--size-13)",
                color: "var(--color-text)",
                fontWeight: 600,
              }}
            >
              Use an existing L402
            </summary>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginTop: 8,
                padding: "12px 14px",
                background: "var(--color-surface-alt)",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
              }}
            >
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  color: "var(--color-dim)",
                  fontSize: "var(--size-12)",
                }}
              >
                L402 Authorization value
                <textarea
                  value={customAuthorization}
                  onChange={(event) => setCustomAuthorization(event.target.value)}
                  placeholder="L402 macaroon:preimage"
                  data-testid="demo-custom-authorization"
                  rows={3}
                  style={{
                    width: "100%",
                    minWidth: 0,
                    resize: "vertical",
                    padding: "8px 10px",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    color: "var(--color-text)",
                    fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                    fontSize: "var(--size-12)",
                    wordBreak: "break-all",
                  }}
                />
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  onClick={useFullCustomCredential}
                  disabled={customAuthorization.trim() === ""}
                  data-testid="demo-use-custom-authorization"
                  style={{
                    padding: "7px 12px",
                    background:
                      customAuthorization.trim() === ""
                        ? "var(--color-surface)"
                        : "var(--color-primary)",
                    color:
                      customAuthorization.trim() === ""
                        ? "var(--color-dim)"
                        : "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    fontSize: "var(--size-12)",
                    fontWeight: 500,
                    cursor: customAuthorization.trim() === "" ? "not-allowed" : "pointer",
                  }}
                >
                  Use Authorization
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(180px, 0.45fr)",
                  gap: 8,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    color: "var(--color-dim)",
                    fontSize: "var(--size-12)",
                  }}
                >
                  Macaroon
                  <textarea
                    value={customMacaroon}
                    onChange={(event) => setCustomMacaroon(event.target.value)}
                    placeholder="base64 macaroon"
                    data-testid="demo-custom-macaroon"
                    rows={3}
                    style={{
                      width: "100%",
                      minWidth: 0,
                      resize: "vertical",
                      padding: "8px 10px",
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 4,
                      color: "var(--color-text)",
                      fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                      fontSize: "var(--size-12)",
                      wordBreak: "break-all",
                    }}
                  />
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      color: "var(--color-dim)",
                      fontSize: "var(--size-12)",
                    }}
                  >
                    Scheme
                    <select
                      value={customScheme}
                      onChange={(event) => {
                        setCustomScheme(event.target.value === "LSAT" ? "LSAT" : "L402");
                      }}
                      data-testid="demo-custom-scheme"
                      style={{
                        padding: "8px 10px",
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 4,
                        color: "var(--color-text)",
                        fontSize: "var(--size-12)",
                      }}
                    >
                      <option value="L402">L402</option>
                      <option value="LSAT">LSAT</option>
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      color: "var(--color-dim)",
                      fontSize: "var(--size-12)",
                    }}
                  >
                    Preimage
                    <input
                      type="text"
                      value={customPreimage}
                      onChange={(event) => setCustomPreimage(event.target.value)}
                      placeholder="64-char hex"
                      data-testid="demo-custom-preimage"
                      style={{
                        width: "100%",
                        minWidth: 0,
                        padding: "8px 10px",
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 4,
                        color: "var(--color-text)",
                        fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                        fontSize: "var(--size-12)",
                      }}
                    />
                  </label>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  onClick={loadWorkbenchMacaroon}
                  disabled={!workbenchMemory?.macaroon}
                  data-testid="demo-load-workbench-macaroon"
                  style={{
                    padding: "7px 12px",
                    background: "var(--color-surface)",
                    color: workbenchMemory?.macaroon ? "var(--color-text)" : "var(--color-dim)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    fontSize: "var(--size-12)",
                    fontWeight: 500,
                    cursor: workbenchMemory?.macaroon ? "pointer" : "not-allowed",
                  }}
                >
                  Use Workbench macaroon
                </button>
                <button
                  type="button"
                  onClick={useCustomCredentialParts}
                  disabled={customMacaroon.trim() === "" || customPreimage.trim() === ""}
                  data-testid="demo-use-custom-parts"
                  style={{
                    padding: "7px 12px",
                    background:
                      customMacaroon.trim() === "" || customPreimage.trim() === ""
                        ? "var(--color-surface)"
                        : "var(--color-primary)",
                    color:
                      customMacaroon.trim() === "" || customPreimage.trim() === ""
                        ? "var(--color-dim)"
                        : "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    fontSize: "var(--size-12)",
                    fontWeight: 500,
                    cursor:
                      customMacaroon.trim() === "" || customPreimage.trim() === ""
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  Use macaroon + preimage
                </button>
              </div>
            </div>
          </details>

          {customCredential ? (
            <div
              data-testid="demo-custom-credential-status"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                color: "var(--color-dim)",
                fontSize: "var(--size-12)",
                order: 12,
              }}
            >
              <span>Custom {customCredential.credential.scheme} credential active.</span>
              <button
                type="button"
                onClick={clearCustomCredential}
                data-testid="demo-clear-custom-credential"
                style={{
                  padding: "4px 8px",
                  background: "var(--color-surface)",
                  color: "var(--color-dim)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 4,
                  fontSize: "var(--size-12)",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  void fetchFreshChallenge();
                }}
                data-testid="demo-fetch-fresh-challenge"
                style={{
                  padding: "4px 8px",
                  background: "var(--color-surface)",
                  color: "var(--color-dim)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 4,
                  fontSize: "var(--size-12)",
                  cursor: "pointer",
                }}
              >
                Fetch fresh challenge
              </button>
            </div>
          ) : null}

          {cachedCredential && !matchingCustomCredential ? (
            <div
              data-testid="demo-credential-status"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                color: "var(--color-dim)",
                fontSize: "var(--size-12)",
                order: 12,
              }}
            >
              <span>Paid {cachedCredential.credential.scheme} credential cached for reuse.</span>
              <button
                type="button"
                onClick={() => setCachedCredential(null)}
                data-testid="demo-clear-credential"
                style={{
                  padding: "4px 8px",
                  background: "var(--color-surface)",
                  color: "var(--color-dim)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 4,
                  fontSize: "var(--size-12)",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>
          ) : null}

          {challenge ? (
            <div
              data-testid="demo-payment"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: "12px 14px",
                background: "var(--color-accent-soft)",
                border: "1px solid var(--color-accent)",
                borderRadius: 4,
                fontSize: "var(--size-13)",
              }}
            >
              <strong>Payment required for Pokemon #{challengePokemonId}.</strong>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 8,
                  alignItems: "stretch",
                }}
              >
                <code
                  data-testid="demo-invoice"
                  style={{
                    fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                    fontSize: "var(--size-12)",
                    wordBreak: "break-all",
                    background: "var(--color-surface)",
                    padding: "8px 10px",
                    borderRadius: 4,
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {challenge.invoice}
                </code>
                <button
                  type="button"
                  aria-label="Copy invoice"
                  title="Copy invoice"
                  data-testid="demo-copy-invoice"
                  onClick={() => {
                    void copyText(challenge.invoice, "invoice");
                  }}
                  style={{
                    width: 38,
                    minWidth: 38,
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    fontSize: "var(--size-16)",
                    cursor: "pointer",
                  }}
                >
                  {copiedTarget === "invoice" ? "OK" : "⧉"}
                </button>
              </div>
              <CopyFeedback active={copiedTarget === "invoice"}>Invoice copied</CopyFeedback>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    void payWithWebLn();
                  }}
                  disabled={weblnDisabled}
                  data-testid="demo-pay-webln"
                  style={{
                    padding: "8px 16px",
                    background: weblnDisabled ? "var(--color-surface-alt)" : "var(--color-primary)",
                    color: weblnDisabled ? "var(--color-dim)" : "var(--color-surface)",
                    border: "none",
                    borderRadius: 4,
                    fontSize: "var(--size-13)",
                    fontWeight: 500,
                    cursor: weblnDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  {webLnDetected === false ? "WebLN unavailable" : "Pay with WebLN"}
                </button>
                <input
                  type="text"
                  value={pastedPreimage}
                  onChange={(event) => setPastedPreimage(event.target.value)}
                  placeholder="paste 64-char hex preimage"
                  data-testid="demo-preimage-input"
                  style={{
                    flex: "1 1 220px",
                    minWidth: 0,
                    padding: "8px 10px",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                    fontSize: "var(--size-12)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    void submitPastedPreimage();
                  }}
                  disabled={pasteDisabled}
                  data-testid="demo-preimage-submit"
                  style={{
                    padding: "8px 16px",
                    background: pasteDisabled ? "var(--color-surface-alt)" : "var(--color-primary)",
                    color: pasteDisabled ? "var(--color-dim)" : "var(--color-surface)",
                    border: "none",
                    borderRadius: 4,
                    fontSize: "var(--size-13)",
                    fontWeight: 500,
                    cursor: pasteDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  Submit preimage
                </button>
              </div>
            </div>
          ) : null}

          {status.kind === "error" ? (
            <div
              data-testid="demo-error"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: "var(--size-13)",
                color: "var(--color-danger)",
                padding: "8px 12px",
                background: "var(--color-danger-soft)",
                border: "1px solid var(--color-danger)",
                borderRadius: 4,
              }}
            >
              <strong data-testid="demo-error-title">{status.error.title}</strong>
              {status.error.details.length > 0 ? (
                <ul
                  data-testid="demo-error-details"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    margin: 0,
                    paddingLeft: 18,
                  }}
                >
                  {status.error.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {status.kind === "ok" ? (
            <div
              data-testid="demo-pokemon"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(96px, 140px) minmax(0, 1fr)",
                gap: 14,
                alignItems: "center",
                padding: "14px",
                background: "var(--color-surface-alt)",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
              }}
            >
              <img
                src={status.pokemon.image}
                alt={status.pokemon.name}
                data-testid="demo-pokemon-image"
                style={{
                  width: "100%",
                  imageRendering: "pixelated",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  data-testid="demo-pokemon-name"
                  style={{
                    textTransform: "capitalize",
                    fontSize: "var(--size-18)",
                    fontWeight: 700,
                  }}
                >
                  {status.pokemon.name}
                </div>
                <div
                  data-testid="demo-pokemon-type"
                  style={{
                    textTransform: "capitalize",
                    color: "var(--color-dim)",
                    fontSize: "var(--size-13)",
                  }}
                >
                  Type: {status.pokemon.type}
                </div>
                <div
                  data-testid="demo-pokemon-id"
                  style={{
                    color: "var(--color-dim)",
                    fontSize: "var(--size-12)",
                  }}
                >
                  Pokemon #{status.pokemon.id}
                </div>
              </div>
            </div>
          ) : null}

          {status.kind === "ok" && !status.l402Protected ? (
            <div
              data-testid="demo-l402-empty"
              style={{
                color: "var(--color-dim)",
                fontSize: "var(--size-12)",
              }}
            >
              Unprotected response: no L402 challenge returned.
            </div>
          ) : null}

          {capturedArtifact ? (
            <ArtifactCard
              artifact={capturedArtifact}
              onCopy={copyText}
              onOpenParse={openParseWithChallenge}
              onOpenMacaroonParse={openParseWithMacaroon}
              onOpenValidate={openValidateWithCredential}
              onFetchFreshChallenge={() => {
                void fetchFreshChallenge();
              }}
              copiedTarget={copiedTarget}
            />
          ) : null}
        </div>
      }
      code={
        <details data-testid="demo-recipe-code">
          <summary
            style={{
              cursor: "pointer",
              padding: "8px 16px",
              borderTop: "1px solid var(--color-border)",
              color: "var(--color-dim)",
              fontSize: "var(--size-12)",
            }}
          >
            Recipe code
          </summary>
          <CodeSnippet
            language="typescript"
            contract="recipe"
            template={`const id = Math.floor(Math.random() * {{maxId}}) + 1;\nconst endpoint = {{endpointTemplate}}.replace("{id}", String(id));\nconst init = { headers: { accept: "application/json" }, cache: "no-store" };\nconst credential = cachedCredential?.endpointTemplate === {{endpointTemplate}}\n  ? cachedCredential.credential\n  : null;\nconst result = await fetchPaidResource(endpoint, credential\n  ? withAuthorization(init, credential)\n  : init,\n);\n\nif (result.status === "challenge") {\n  // Pay invoice, then cache Authorization per L402 protocol-specification.md §8.\n}`}
            values={{
              maxId: String(MAX_POKEMON_ID),
              endpointTemplate: JSON.stringify(endpointTemplate),
            }}
          />
        </details>
      }
    />
  );
}

function ArtifactCard({
  artifact,
  onCopy,
  onOpenParse,
  onOpenMacaroonParse,
  onOpenValidate,
  onFetchFreshChallenge,
  copiedTarget,
}: {
  artifact: CapturedArtifact;
  onCopy: (value: string, target: CopyTarget) => void | Promise<void>;
  onOpenParse: (rawAuthenticate: string) => void;
  onOpenMacaroonParse: (macaroon: string) => void;
  onOpenValidate: (credential: PaidCredential) => void;
  onFetchFreshChallenge: () => void;
  copiedTarget: CopyTarget | null;
}) {
  if (artifact.kind === "challenge") {
    const challengeCaveats = extractCaveatSummaries(artifact.rawAuthenticate);
    return (
      <ArtifactShell testId="demo-captured-challenge" title="L402 challenge captured">
        <p style={artifactTextStyle}>
          The proxy returned a challenge. Parse it to inspect the invoice and macaroon.
        </p>
        <CaveatSummaryList caveats={challengeCaveats} />
        <ArtifactActions>
          <ArtifactButton
            testId="demo-open-parse"
            onClick={() => onOpenParse(artifact.rawAuthenticate)}
          >
            Parse L402
          </ArtifactButton>
          <ArtifactButton
            testId="demo-copy-challenge"
            onClick={() => {
              void onCopy(artifact.rawAuthenticate, "challenge");
            }}
            subtle
          >
            {copiedTarget === "challenge" ? "Copied" : "Copy"}
          </ArtifactButton>
        </ArtifactActions>
        <CopyFeedback active={copiedTarget === "challenge"}>Challenge copied</CopyFeedback>
        <RawArtifactDetails
          label="Show WWW-Authenticate"
          testId="demo-raw-www-authenticate"
          value={artifact.rawAuthenticate}
        />
      </ArtifactShell>
    );
  }

  const rejected = artifact.outcome === "rejected";
  const credentialCaveats = extractCaveatSummaries(artifact.credential.authorization);
  return (
    <ArtifactShell
      testId={rejected ? "demo-rejected-credential" : "demo-created-credential"}
      title={rejected ? "Credential rejected" : "Credential created"}
    >
      <p style={artifactTextStyle}>
        {rejected
          ? "The proxy rejected this Authorization header. Validate it or fetch a fresh challenge."
          : "The retry used an Authorization header. Validate it or copy it for another client."}
      </p>
      <CaveatSummaryList caveats={credentialCaveats} />
      <ArtifactActions>
        <ArtifactButton
          testId="demo-open-validate"
          onClick={() => onOpenValidate(artifact.credential)}
        >
          Validate L402
        </ArtifactButton>
        <ArtifactButton
          testId="demo-open-parse-credential"
          onClick={() => onOpenMacaroonParse(artifact.credential.macaroon)}
          subtle
        >
          Parse L402
        </ArtifactButton>
        <ArtifactButton
          testId="demo-copy-credential"
          onClick={() => {
            void onCopy(artifact.credential.authorization, "credential");
          }}
          subtle
        >
          {copiedTarget === "credential" ? "Copied" : "Copy"}
        </ArtifactButton>
        {rejected ? (
          <ArtifactButton
            testId="demo-artifact-fetch-fresh-challenge"
            onClick={onFetchFreshChallenge}
            subtle
          >
            Fetch fresh challenge
          </ArtifactButton>
        ) : null}
      </ArtifactActions>
      <CopyFeedback active={copiedTarget === "credential"}>Credential copied</CopyFeedback>
      <RawArtifactDetails
        label="Show Authorization"
        testId="demo-raw-authorization"
        value={artifact.credential.authorization}
      />
    </ArtifactShell>
  );
}

function CaveatSummaryList({ caveats }: { caveats: CaveatSummary[] }) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!caveats.some((caveat) => caveat.expiresAtMs !== null)) return;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [caveats]);

  if (caveats.length === 0) {
    return (
      <div
        data-testid="demo-caveats-empty"
        style={{
          color: "var(--color-dim)",
          fontSize: "var(--size-12)",
        }}
      >
        Restrictions: none found in this macaroon.
      </div>
    );
  }

  return (
    <div
      data-testid="demo-caveats"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span style={{ color: "var(--color-dim)", fontSize: "var(--size-12)" }}>Restrictions</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {caveats.map((caveat, index) => (
          <CaveatPill
            key={`${caveat.condition}:${caveat.value}:${String(index)}`}
            state={
              caveat.expiresAtMs !== null && caveat.expiresAtMs <= nowMs ? "rejected" : "matched"
            }
          >
            <span data-testid={`demo-caveat-${index}`}>{caveat.label}</span>
          </CaveatPill>
        ))}
      </div>
      {caveats
        .filter((caveat) => caveat.expiresAtMs !== null)
        .map((caveat, index) => (
          <span
            key={`${caveat.condition}:${caveat.value}:timer`}
            data-testid={`demo-caveat-timer-${index}`}
            style={{
              color: "var(--color-dim)",
              fontSize: "var(--size-12)",
              fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
            }}
          >
            {formatExpirationCountdown(caveat.expiresAtMs!, nowMs)}
          </span>
        ))}
    </div>
  );
}

function CopyFeedback({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      aria-live="polite"
      data-testid="demo-copy-feedback"
      style={{
        minHeight: 16,
        color: active ? "var(--color-accent)" : "transparent",
        fontSize: "var(--size-12)",
      }}
    >
      {active ? children : ""}
    </span>
  );
}

function extractCaveatSummaries(input: string): CaveatSummary[] {
  const macaroon = extractMacaroonForInspection(input);
  if (macaroon === "") return [];

  try {
    return extractRawCaveats(base64ToBytes(macaroon)).map((caveat) => ({
      ...caveat,
      label: formatCaveatLabel(caveat.condition, caveat.value),
      expiresAtMs: parseCaveatExpiration(caveat.condition, caveat.value),
    }));
  } catch {
    return [];
  }
}

function extractMacaroonForInspection(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";

  try {
    const challenges = parseAuthenticateHeader(trimmed.replace(/^WWW-Authenticate:\s*/i, ""));
    const challenge = challenges.find((entry) => entry.scheme === "L402") ?? challenges[0];
    return challenge?.macaroon ?? "";
  } catch {
    // Fall through to Authorization or raw macaroon input.
  }

  const authorization = trimmed.replace(/^Authorization:\s*/i, "");
  const authMatch = /^(?:L402|LSAT)\s+([^:\s]+)(?::[0-9a-fA-F]{64})?$/u.exec(authorization);
  if (authMatch?.[1]) return authMatch[1];
  return trimmed;
}

/**
 * L402 macaroon-spec.md §Caveat Format: caveats are UTF-8 condition=value
 * strings; this reads the local Aperture-compatible V2 layout used by
 * @boltwall/l402's private macaroon codec for display only.
 */
function extractRawCaveats(bytes: Uint8Array): Array<{ condition: string; value: string }> {
  const caveats: Array<{ condition: string; value: string }> = [];
  const decoder = new TextDecoder();
  let pos = 1;

  if (bytes.length < 1 || bytes[0] !== 2) return caveats;

  function readVarint(): number {
    let result = 0;
    let shift = 0;
    while (pos < bytes.length) {
      const byte = bytes[pos++] ?? 0;
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  }

  while (pos < bytes.length) {
    const tag = bytes[pos++];
    if (tag === 0) break;
    if (tag === 6) return caveats;
    pos += readVarint();
  }

  while (pos < bytes.length) {
    const tag = bytes[pos];
    if (tag === 0 || tag === 6) break;
    pos++;
    const length = readVarint();
    const fieldBytes = bytes.slice(pos, pos + length);
    pos += length;
    if (bytes[pos] === 0) pos++;
    if (tag !== 2) continue;

    const raw = decoder.decode(fieldBytes);
    try {
      caveats.push(parseCaveat(raw));
    } catch {
      caveats.push({ condition: raw, value: "" });
    }
  }

  return caveats;
}

function base64ToBytes(input: string): Uint8Array {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function formatCaveatLabel(condition: string, value: string): string {
  if (
    condition === "valid-until" ||
    condition === "expiration" ||
    condition.endsWith("_valid_until")
  ) {
    return `expires ${formatExpirationValue(value)}`;
  }
  if (condition === "services") return `services ${value}`;
  if (condition.endsWith("_capabilities")) {
    return `${condition.replace(/_capabilities$/u, "")} can ${value}`;
  }
  if (condition === "origin") return `origin ${value}`;
  if (condition === "route") return `route ${value}`;
  if (condition === "ip") return `ip ${value}`;
  return value === "" ? condition : `${condition} ${value}`;
}

function parseCaveatExpiration(condition: string, value: string): number | null {
  if (condition === "valid-until") {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
  }
  if (condition === "expiration") {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (condition.endsWith("_valid_until")) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
  }
  return null;
}

function formatExpirationValue(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return new Date(timestamp).toLocaleString();
  return value;
}

function formatExpirationCountdown(expiresAtMs: number, nowMs: number): string {
  const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
  if (remainingSeconds === 0) return "expired";
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  if (minutes === 0) return `expires in ${String(seconds)}s`;
  return `expires in ${String(minutes)}m ${String(seconds).padStart(2, "0")}s`;
}

function ArtifactShell({
  children,
  testId,
  title,
}: {
  children: ReactNode;
  testId: string;
  title: string;
}) {
  return (
    <section
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 14px",
        background: "var(--color-surface-alt)",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        fontSize: "var(--size-13)",
      }}
    >
      <strong>{title}</strong>
      {children}
    </section>
  );
}

function ArtifactActions({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>;
}

function ArtifactButton({
  children,
  onClick,
  subtle = false,
  testId,
}: {
  children: ReactNode;
  onClick: () => void;
  subtle?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      style={{
        padding: "7px 12px",
        background: subtle ? "var(--color-surface)" : "var(--color-primary)",
        color: subtle ? "var(--color-text)" : "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        fontSize: "var(--size-12)",
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function RawArtifactDetails({
  label,
  testId,
  value,
}: {
  label: string;
  testId: string;
  value: string;
}) {
  return (
    <details>
      <summary
        style={{
          cursor: "pointer",
          color: "var(--color-dim)",
          fontSize: "var(--size-12)",
        }}
      >
        {label}
      </summary>
      <code
        data-testid={testId}
        style={{
          display: "block",
          marginTop: 8,
          padding: "8px 10px",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
          fontSize: "var(--size-12)",
          wordBreak: "break-all",
        }}
      >
        {value}
      </code>
    </details>
  );
}

const artifactTextStyle = {
  margin: 0,
  color: "var(--color-dim)",
} satisfies CSSProperties;

function pokemonRequestInit(): RequestInit {
  return {
    headers: { accept: "application/json" },
    cache: "no-store",
  };
}

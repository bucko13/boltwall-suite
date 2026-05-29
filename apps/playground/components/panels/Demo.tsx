"use client";

import { L402 } from "@boltwall/l402";
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
  type PaidChallenge,
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
} & PaidChallenge;

// One credential slot per endpoint. The slot is a discriminated value: a
// credential is either pasted by the user ("custom") or earned by paying a
// challenge ("paid"). It is scoped to the endpoint it was captured for so a
// stale credential never leaks across endpoints.
type CredentialSlot = {
  source: "custom" | "paid";
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
  | {
      kind: "credential";
      outcome: "created" | "rejected";
      credential: PaidCredential;
      sourceChallenge?: string;
    };

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
  } catch (error) {
    if (error instanceof URIError) return trimmed;
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

// Persist the earned credential and its endpoint so navigating away and back
// keeps endpoint access without re-paying. sessionStorage (per-tab) matches the
// Workbench memory lifetime; transient status/artifact are intentionally not
// persisted and are re-derived by the next fetch.
const DEMO_SESSION_STORAGE_KEY = "bw.demo-session";

type PersistedDemoSession = {
  endpointOverride: string;
  credentialSlot: CredentialSlot | null;
};

function isCredentialSlot(value: unknown): value is CredentialSlot {
  if (typeof value !== "object" || value === null) return false;
  const slot = value as Record<string, unknown>;
  if (slot.source !== "custom" && slot.source !== "paid") return false;
  if (typeof slot.endpointTemplate !== "string") return false;
  const credential = slot.credential as Record<string, unknown> | null;
  if (typeof credential !== "object" || credential === null) return false;
  return typeof credential.authorization === "string" && typeof credential.macaroon === "string";
}

function readStoredDemoSession(): PersistedDemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedDemoSession>;
    const endpointOverride =
      typeof parsed.endpointOverride === "string" ? parsed.endpointOverride : "";
    const credentialSlot = isCredentialSlot(parsed.credentialSlot) ? parsed.credentialSlot : null;
    if (!endpointOverride && !credentialSlot) return null;
    return { endpointOverride, credentialSlot };
  } catch {
    return null;
  }
}

function writeStoredDemoSession(session: PersistedDemoSession) {
  if (typeof window === "undefined") return;
  try {
    if (!session.endpointOverride && !session.credentialSlot) {
      window.sessionStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // sessionStorage is a progressive enhancement; keep the demo usable without it.
  }
}

export function Demo() {
  const router = useRouter();
  const workbenchMemory = useWorkbenchMemory();
  const [endpointOverride, setEndpointOverride] = useState("");
  const [webLnDetected, setWebLnDetected] = useState<boolean | null>(null);
  const [pastedPreimage, setPastedPreimage] = useState("");
  const [credentialSlot, setCredentialSlot] = useState<CredentialSlot | null>(null);
  const [customAuthorization, setCustomAuthorization] = useState("");
  const [customMacaroon, setCustomMacaroon] = useState("");
  const [customPreimage, setCustomPreimage] = useState("");
  const [customScheme, setCustomScheme] = useState<"L402" | "LSAT">("L402");
  const [status, setStatus] = useState<DemoStatus>({ kind: "idle" });
  const [capturedArtifact, setCapturedArtifact] = useState<CapturedArtifact | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);
  const [endpointSettingsOpen, setEndpointSettingsOpen] = useState(false);
  const [customCredentialOpen, setCustomCredentialOpen] = useState(false);
  const [demoSessionHydrated, setDemoSessionHydrated] = useState(false);

  useEffect(() => {
    setWebLnDetected(getWebLn() !== null);
  }, []);

  // Restore a previously paid/custom credential and its endpoint on mount so a
  // returning user keeps access. Hydrate from storage before the persistence
  // effect runs (gated on demoSessionHydrated) so defaults never overwrite it.
  useEffect(() => {
    const stored = readStoredDemoSession();
    if (stored) {
      setEndpointOverride(stored.endpointOverride);
      setCredentialSlot(stored.credentialSlot);
    }
    setDemoSessionHydrated(true);
  }, []);

  useEffect(() => {
    if (!demoSessionHydrated) return;
    writeStoredDemoSession({ endpointOverride, credentialSlot });
  }, [credentialSlot, demoSessionHydrated, endpointOverride]);

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
  // The slot only counts as active when it was captured for the current
  // endpoint. A freshly pasted custom credential wins over a cached paid one
  // for the same endpoint because pasting replaces the whole slot (see
  // adoptCustomCredential), so precedence falls out of the single-slot model.
  const activeCredential =
    credentialSlot?.endpointTemplate === endpointTemplate ? credentialSlot : null;
  const workbenchArtifact = useMemo<CapturedArtifact | null>(() => {
    if (!workbenchMemory) return null;
    const credential = workbenchMemory.credential.trim();
    if (credential !== "") {
      try {
        const sourceChallenge = workbenchMemory.challenge.trim();
        return {
          kind: "credential",
          outcome: "created",
          credential: parsePastedCredential(credential),
          ...(sourceChallenge ? { sourceChallenge } : {}),
        };
      } catch (error) {
        if (error instanceof Error) {
          return null;
        }
        return null;
      }
    }
    const challenge = workbenchMemory.challenge.trim();
    if (challenge !== "") {
      return { kind: "challenge", rawAuthenticate: challenge };
    }
    return null;
  }, [workbenchMemory]);
  const visibleArtifact = capturedArtifact ?? workbenchArtifact;

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
        setCredentialSlot(null);
        await handleFetchResult(
          id,
          endpoint,
          await fetchPaidResource(endpoint, pokemonRequestInit()),
          false,
        );
        return;
      }
      if (credential !== null && result.status === "challenge") {
        setCredentialSlot(null);
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
    setCredentialSlot(null);
    await getPokemon(false);
  }

  // A freshly pasted custom credential takes the slot outright, evicting any
  // cached paid credential for the endpoint.
  function adoptCustomCredential(credential: PaidCredential) {
    setCredentialSlot({ source: "custom", endpointTemplate, credential });
    setStatus({ kind: "idle" });
  }

  function useFullCustomCredential() {
    try {
      adoptCustomCredential(parsePastedCredential(customAuthorization));
    } catch (error) {
      setStatus({
        kind: "error",
        error: messageError(error instanceof Error ? error.message : String(error)),
      });
    }
  }

  function useCustomCredentialParts() {
    try {
      adoptCustomCredential(
        buildPastedCredentialParts(customMacaroon, customPreimage, customScheme),
      );
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

  // Reset the raw paste inputs that buffer an in-progress custom credential.
  function clearCustomBuffers() {
    setCustomAuthorization("");
    setCustomMacaroon("");
    setCustomPreimage("");
  }

  // The custom-credential banner's Clear: drop the slot and its editing buffer.
  function clearCustomCredential() {
    setCredentialSlot(null);
    clearCustomBuffers();
  }

  // Changing the endpoint invalidates every credential we hold for the old one.
  // Clear the whole slot (custom or paid) and the raw paste inputs so no stale
  // credential state can leak across endpoints. (Transient status/artifact are
  // intentionally left alone — the next fetch replaces them, and clearing them
  // on every keystroke would dismiss an in-progress payment challenge while the
  // user edits the URL.)
  function resetCredentialStateForEndpoint() {
    setCredentialSlot(null);
    clearCustomBuffers();
  }

  async function copyText(value: string, target: CopyTarget) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
    } catch (error) {
      if (error instanceof Error) {
        setStatus({
          kind: "error",
          error: messageError(error.message),
        });
      }
      // Copy affordances are progressive enhancement; keep the flow usable.
    }
  }

  function openParseWithChallenge(rawAuthenticate: string) {
    workbenchMemory?.setChallenge(rawAuthenticate);
    router.push(`/p/parse?from-challenge.challenge=${encodeURIComponent(rawAuthenticate)}`);
  }

  function openParseWithMacaroon(macaroon: string, sourceChallenge?: string) {
    workbenchMemory?.setMacaroon(macaroon);
    if (sourceChallenge) {
      workbenchMemory?.setChallenge(sourceChallenge);
      router.push(
        `/p/parse?parse-token.token=${encodeURIComponent(macaroon)}&from-challenge.challenge=${encodeURIComponent(sourceChallenge)}`,
      );
      return;
    }
    router.push(`/p/parse?parse-token.token=${encodeURIComponent(macaroon)}`);
  }

  function openValidateWithCredential(credential: PaidCredential, sourceChallenge?: string) {
    workbenchMemory?.setCredential(credential.authorization);
    workbenchMemory?.setMacaroon(credential.macaroon);
    if (sourceChallenge) {
      workbenchMemory?.setChallenge(sourceChallenge);
    }
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
        sourceChallenge: challenge.rawAuthenticate,
      });
      workbenchMemory?.setCredential(result.credential.authorization);
      workbenchMemory?.setChallenge(challenge.rawAuthenticate);
      workbenchMemory?.setMacaroon(result.credential.macaroon);
      setCredentialSlot({
        source: "paid",
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
      sourceChallenge: challenge.rawAuthenticate,
    });
    workbenchMemory?.setCredential(result.credential.authorization);
    workbenchMemory?.setChallenge(challenge.rawAuthenticate);
    workbenchMemory?.setMacaroon(result.credential.macaroon);
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
    workbenchMemory?.setChallenge(result.challenge.rawAuthenticate);
    // The macaroon is carried by both the challenge and (later) the credential,
    // so surface it in Workbench memory as soon as either becomes available.
    workbenchMemory?.setMacaroon(result.challenge.macaroon);
    setStatus({
      kind: "awaiting-payment",
      id,
      challenge: {
        endpoint,
        endpointTemplate,
        rawAuthenticate: result.challenge.rawAuthenticate,
        token: result.challenge.token,
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
  const primaryActionLabel =
    endpointTemplate === PUBLIC_POKEMON_ENDPOINT_TEMPLATE ? "Get Random Pokemon" : "Fetch Endpoint";

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
            {busy ? "Loading..." : primaryActionLabel}
          </button>

          <details
            data-testid="demo-endpoint-settings"
            open={endpointSettingsOpen}
            onToggle={(event) => setEndpointSettingsOpen(event.currentTarget.open)}
            style={{ order: 30 }}
          >
            <DisclosureSummary iconTestId="demo-endpoint-settings-icon" open={endpointSettingsOpen}>
              Use a different endpoint
            </DisclosureSummary>
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
                  resetCredentialStateForEndpoint();
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

          <details
            data-testid="demo-custom-credential"
            open={customCredentialOpen}
            onToggle={(event) => setCustomCredentialOpen(event.currentTarget.open)}
            style={{ order: 31 }}
          >
            <DisclosureSummary iconTestId="demo-custom-credential-icon" open={customCredentialOpen}>
              Use an existing L402
            </DisclosureSummary>
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
                  Use parsed macaroon
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

          {credentialSlot?.source === "custom" ? (
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
              <span>Custom {credentialSlot.credential.scheme} credential active.</span>
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

          {credentialSlot?.source === "paid" ? (
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
              <span>Paid {credentialSlot.credential.scheme} credential cached for reuse.</span>
              <button
                type="button"
                onClick={() => setCredentialSlot(null)}
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
                  aria-label={copiedTarget === "invoice" ? "Invoice copied" : "Copy invoice"}
                  title={copiedTarget === "invoice" ? "Invoice copied" : "Copy invoice"}
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
                    transition:
                      "background-color 160ms ease, border-color 160ms ease, color 160ms ease",
                    ...(copiedTarget === "invoice"
                      ? {
                          background: "var(--color-accent-soft)",
                          color: "var(--color-accent)",
                          border: "1px solid var(--color-accent)",
                        }
                      : {}),
                  }}
                >
                  {copiedTarget === "invoice" ? "✓" : "⧉"}
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
                    fontSize: "var(--size-20)",
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

          {visibleArtifact ? (
            <ArtifactCard
              artifact={visibleArtifact}
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
  onOpenMacaroonParse: (macaroon: string, sourceChallenge?: string) => void;
  onOpenValidate: (credential: PaidCredential, sourceChallenge?: string) => void;
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
            ariaLabel={copiedTarget === "challenge" ? "Challenge copied" : "Copy challenge"}
            title={copiedTarget === "challenge" ? "Challenge copied" : "Copy challenge"}
            copied={copiedTarget === "challenge"}
            subtle
          >
            {copiedTarget === "challenge" ? "✓" : "⧉"}
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
          onClick={() => onOpenValidate(artifact.credential, artifact.sourceChallenge)}
        >
          Validate L402
        </ArtifactButton>
        <ArtifactButton
          testId="demo-open-parse-credential"
          onClick={() =>
            onOpenMacaroonParse(artifact.credential.macaroon, artifact.sourceChallenge)
          }
          subtle
        >
          Parse L402
        </ArtifactButton>
        <ArtifactButton
          testId="demo-copy-credential"
          onClick={() => {
            void onCopy(artifact.credential.authorization, "credential");
          }}
          ariaLabel={copiedTarget === "credential" ? "Credential copied" : "Copy credential"}
          title={copiedTarget === "credential" ? "Credential copied" : "Copy credential"}
          copied={copiedTarget === "credential"}
          subtle
        >
          {copiedTarget === "credential" ? "✓" : "⧉"}
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

function DisclosureSummary({
  children,
  iconTestId,
  open,
}: {
  children: ReactNode;
  iconTestId: string;
  open: boolean;
}) {
  return (
    <summary
      style={{
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 0",
        fontSize: "var(--size-13)",
        color: "var(--color-text)",
        fontWeight: 600,
        listStyle: "none",
      }}
    >
      <span
        aria-hidden="true"
        data-testid={iconTestId}
        data-state={open ? "open" : "closed"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRight: "1.5px solid var(--color-dim)",
            borderBottom: "1.5px solid var(--color-dim)",
            transform: open ? "rotate(45deg)" : "rotate(-45deg)",
            transition: "transform 120ms ease",
          }}
        />
      </span>
      <span>{children}</span>
    </summary>
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
        opacity: active ? 1 : 0,
        transition: "opacity 180ms ease",
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
    return L402.fromMacaroon(macaroon)
      .getCaveats()
      .map((caveat) => ({
        condition: caveat.condition,
        value: caveat.value,
        label: formatCaveatLabel(caveat.condition, caveat.value),
        expiresAtMs: parseCaveatExpiration(caveat.condition, caveat.value),
      }));
  } catch (error) {
    if (error instanceof Error && error.message === "empty-macaroons") return [];
    return [];
  }
}

function extractMacaroonForInspection(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";

  try {
    return L402.fromHeader(trimmed.replace(/^WWW-Authenticate:\s*/i, "")).macaroon;
  } catch (challengeError) {
    if (challengeError instanceof Error && challengeError.message === "empty-header") return "";
    // Fall through to Authorization or raw macaroon input.
  }

  try {
    return L402.fromToken(trimmed.replace(/^Authorization:\s*/i, "")).macaroon;
  } catch (authorizationError) {
    if (authorizationError instanceof Error && authorizationError.message === "empty-macaroons") {
      return "";
    }
  }

  return trimmed;
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
  ariaLabel,
  copied = false,
  onClick,
  subtle = false,
  testId,
  title,
}: {
  children: ReactNode;
  ariaLabel?: string;
  copied?: boolean;
  onClick: () => void;
  subtle?: boolean;
  testId: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      data-testid={testId}
      title={title}
      style={{
        padding: "7px 12px",
        minWidth: ariaLabel?.startsWith("Copy") || ariaLabel?.endsWith("copied") ? 38 : undefined,
        background: copied
          ? "var(--color-accent-soft)"
          : subtle
            ? "var(--color-surface)"
            : "var(--color-primary)",
        color: copied
          ? "var(--color-accent)"
          : subtle
            ? "var(--color-text)"
            : "var(--color-surface)",
        border: copied ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
        borderRadius: 4,
        fontSize: "var(--size-12)",
        fontWeight: 500,
        cursor: "pointer",
        textAlign: "center",
        transition: "background-color 160ms ease, border-color 160ms ease, color 160ms ease",
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

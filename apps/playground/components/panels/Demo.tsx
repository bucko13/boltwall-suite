"use client";

import { useEffect, useMemo, useState } from "react";

import {
  fetchPaidResource,
  parsePastedPreimage,
  retryWithCredential,
} from "../../lib/payment";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

const PUBLIC_POKEMON_ENDPOINT_TEMPLATE = "https://pokeapi.co/api/v2/pokemon/{id}";
const CONFIGURED_DEMO_ENDPOINT =
  process.env.NEXT_PUBLIC_BOLTWALL_PLAYGROUND_DEMO_ENDPOINT ?? "";
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
  invoice: string;
  macaroon: string;
  scheme: "L402" | "LSAT";
};

type DemoStatus =
  | { kind: "idle" }
  | { kind: "fetching"; id: number }
  | { kind: "awaiting-payment"; id: number; challenge: ChallengeState }
  | { kind: "paying"; id: number }
  | { kind: "ok"; pokemon: Pokemon; l402Protected: boolean }
  | { kind: "error"; message: string };

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
    value.sprites?.front_default ??
    value.sprites?.other?.["official-artwork"]?.front_default ??
    "";
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

export function Demo() {
  const [endpointOverride, setEndpointOverride] = useState("");
  const [webLnDetected, setWebLnDetected] = useState<boolean | null>(null);
  const [pastedPreimage, setPastedPreimage] = useState("");
  const [status, setStatus] = useState<DemoStatus>({ kind: "idle" });

  useEffect(() => {
    setWebLnDetected(getWebLn() !== null);
  }, []);

  const endpointTemplate = useMemo(
    () => pickEndpointTemplate(endpointOverride),
    [endpointOverride],
  );
  const usingConfiguredEndpoint =
    endpointOverride.trim() !== "" || CONFIGURED_DEMO_ENDPOINT !== "";

  async function getPokemon() {
    const id = randomPokemonId();
    const endpoint = endpointForPokemon(endpointTemplate, id);
    setStatus({ kind: "fetching", id });
    setPastedPreimage("");
    try {
      const result = await fetchPaidResource(endpoint, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (result.status === "ok") {
        const text = await result.response.text();
        setStatus({
          kind: "ok",
          pokemon: parsePokemon(text),
          l402Protected: false,
        });
        return;
      }
      if (result.status === "error") {
        const text = await result.response.text();
        setStatus({
          kind: "error",
          message: `request failed ${String(result.response.status)}: ${text}`,
        });
        return;
      }
      setWebLnDetected(getWebLn() !== null);
      setStatus({
        kind: "awaiting-payment",
        id,
        challenge: {
          endpoint,
          invoice: result.challenge.invoice,
          macaroon: result.challenge.macaroon,
          scheme: result.challenge.scheme,
        },
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function payWithWebLn() {
    if (status.kind !== "awaiting-payment") return;
    const webln = getWebLn();
    if (webln === null) {
      setStatus({ kind: "error", message: "WebLN not detected" });
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
        message: error instanceof Error ? error.message : String(error),
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
        message: error instanceof Error ? error.message : String(error),
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
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function retryAndRender(
    id: number,
    challenge: ChallengeState,
    preimage: string,
  ) {
    const result = await retryWithCredential(
      challenge.endpoint,
      { headers: { accept: "application/json" }, cache: "no-store" },
      challenge,
      preimage,
    );
    if (result.status === "paid") {
      const text = await result.response.text();
      setStatus({
        kind: "ok",
        pokemon: parsePokemon(text),
        l402Protected: true,
      });
      return;
    }
    const text = await result.response.text();
    setStatus({
      kind: "error",
      message: `retry returned ${String(result.response.status)}: ${text}`,
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
      ? "ready"
      : status.kind === "fetching"
        ? "fetching"
        : status.kind === "awaiting-payment"
          ? "payment"
          : status.kind === "paying"
            ? "paying"
            : status.kind === "ok"
              ? status.l402Protected
                ? "loaded"
                : "unprotected"
              : "error";
  const challenge =
    status.kind === "awaiting-payment" ? status.challenge : undefined;
  const challengePokemonId =
    status.kind === "awaiting-payment" ? status.id : undefined;
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
              details={status.kind === "error" ? status.message : null}
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
            }}
          >
            {busy ? "Loading..." : "Get Random Pokemon"}
          </button>

          <details data-testid="demo-endpoint-settings">
            <summary
              style={{
                cursor: "pointer",
                fontSize: "var(--size-12)",
                color: "var(--color-dim)",
              }}
            >
              Endpoint settings
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
              Advanced endpoint override
              <input
                type="url"
                value={endpointOverride}
                placeholder={
                  CONFIGURED_DEMO_ENDPOINT ||
                  PUBLIC_POKEMON_ENDPOINT_TEMPLATE
                }
                onChange={(event) => setEndpointOverride(event.target.value)}
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
              }}
            >
              {endpointTemplate}
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
                    background: weblnDisabled
                      ? "var(--color-surface-alt)"
                      : "var(--color-primary)",
                    color: weblnDisabled
                      ? "var(--color-dim)"
                      : "var(--color-surface)",
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
                    background: pasteDisabled
                      ? "var(--color-surface-alt)"
                      : "var(--color-primary)",
                    color: pasteDisabled
                      ? "var(--color-dim)"
                      : "var(--color-surface)",
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
                fontSize: "var(--size-13)",
                color: "var(--color-danger)",
                padding: "8px 12px",
                background: "var(--color-danger-soft)",
                border: "1px solid var(--color-danger)",
                borderRadius: 4,
              }}
            >
              {status.message}
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

          {status.kind === "ok" ? (
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

          {challenge ? (
            <details data-testid="demo-l402-details">
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: "var(--size-12)",
                  color: "var(--color-dim)",
                }}
              >
                L402 challenge
              </summary>
              <div
                data-testid="demo-l402-challenge"
                style={{
                  display: "grid",
                  gridTemplateColumns: "96px minmax(0, 1fr)",
                  gap: "6px 12px",
                  marginTop: 8,
                  padding: "12px 14px",
                  background: "var(--color-accent-soft)",
                  border: "1px solid var(--color-accent)",
                  borderRadius: 4,
                  fontSize: "var(--size-13)",
                }}
              >
                <span style={{ color: "var(--color-dim)" }}>scheme</span>
                <span data-testid="demo-scheme">{challenge.scheme}</span>
                <span style={{ color: "var(--color-dim)" }}>invoice</span>
                <span
                  data-testid="demo-protocol-invoice"
                  style={{
                    fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                    fontSize: "var(--size-12)",
                    wordBreak: "break-all",
                  }}
                >
                  {challenge.invoice}
                </span>
                <span style={{ color: "var(--color-dim)" }}>macaroon</span>
                <span
                  data-testid="demo-protocol-macaroon"
                  style={{
                    fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                    fontSize: "var(--size-12)",
                    wordBreak: "break-all",
                  }}
                >
                  {challenge.macaroon}
                </span>
              </div>
            </details>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          contract="recipe"
          template={`const id = Math.floor(Math.random() * {{maxId}}) + 1;\nconst endpoint = {{endpointTemplate}}.replace("{id}", String(id));\nconst result = await fetchPaidResource(endpoint, {\n  headers: { accept: "application/json" },\n  cache: "no-store",\n});\n\nif (result.status === "challenge") {\n  // Pay invoice, then retry with Authorization per L402 protocol-specification.md §6.2.\n}`}
          values={{
            maxId: String(MAX_POKEMON_ID),
            endpointTemplate: JSON.stringify(endpointTemplate),
          }}
        />
      }
    />
  );
}

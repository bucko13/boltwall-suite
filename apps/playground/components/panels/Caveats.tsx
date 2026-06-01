"use client";

import { Caveat, L402, validUntil } from "@boltwall/l402";
import { useEffect, useMemo, useState } from "react";

import { describeArtifactError, detectArtifact } from "../../lib/detect-artifact";
import { useWorkbenchMemory } from "../../lib/url-state";
import { BigBlob } from "../ui/big-blob";
import { CaveatPill } from "../ui/caveat-pill";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { FillFromWorkbench } from "../ui/fill-from-workbench";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

import { panelInputStyle, panelTextareaStyle } from "./panel-styles";

type CaveatRow = { condition: string; value: string };
const EMPTY_CAVEATS: CaveatRow[] = [];

/**
 * Re-derives the attenuated macaroon and its full caveat list from a base
 * macaroon plus the caveats the user has appended. Attenuation is append-only
 * and needs no root key (the defining property of macaroons), so this is a pure
 * function of (base, added) — recomputed on every render rather than mutating a
 * stored token.
 */
function attenuate(
  baseMacaroon: string,
  added: CaveatRow[],
): { macaroon: string; caveats: CaveatRow[] } | null {
  try {
    const token = L402.fromMacaroon(baseMacaroon);
    for (const c of added) {
      token.addFirstPartyCaveat(new Caveat(c.condition, c.value));
    }
    return {
      macaroon: token.macaroon,
      caveats: token.getCaveats().map((c) => ({ condition: c.condition, value: c.value })),
    };
  } catch {
    return null;
  }
}

/**
 * The expiry instant (ms) of a time caveat, or null for non-time caveats. Mirrors
 * the L402 time conditions: `valid-until` (ISO/RFC date), `expiration` (unix ms),
 * and imported `*_valid_until` (unix seconds or ms). Client-side this is the only
 * caveat class we can meaningfully validate — service/capability caveats are
 * enforced server-side (see apps/playground/CONTEXT.md).
 */
function caveatExpiryMs(condition: string, value: string): number | null {
  if (condition === "valid-until") {
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : ts;
  }
  if (condition === "expiration") {
    const ts = Number(value);
    return Number.isFinite(ts) ? ts : null;
  }
  if (condition.endsWith("_valid_until")) {
    const n = Number(value);
    if (Number.isFinite(n)) return n < 10_000_000_000 ? n * 1000 : n;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : ts;
  }
  return null;
}

function pillState(expiryMs: number | null, nowMs: number) {
  if (expiryMs === null) return "unsatisfied" as const;
  return expiryMs <= nowMs ? ("rejected" as const) : ("matched" as const);
}

function parsePositiveIntegerSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

export function Caveats() {
  const workbenchMemory = useWorkbenchMemory();

  // Inputs are plain local state — never auto-synced to the URL or Workbench.
  const [input, setInput] = useState("");
  const [added, setAdded] = useState<CaveatRow[]>([]);
  const [draft, setDraft] = useState<CaveatRow>({ condition: "", value: "" });
  const [seconds, setSeconds] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Re-render the expiry pills on a timer so countdowns stay live.
  const [nowMs, setNowMs] = useState(() => Date.now());

  const detected = input.trim() ? detectArtifact(input) : null;
  const base = detected?.ok ? detected.value : null;
  const baseMacaroon = base?.macaroon ?? null;
  const result = useMemo(
    () => (baseMacaroon ? attenuate(baseMacaroon, added) : null),
    [baseMacaroon, added],
  );
  const baseCaveatCount = useMemo(
    () => (baseMacaroon ? (attenuate(baseMacaroon, [])?.caveats.length ?? 0) : 0),
    [baseMacaroon],
  );
  const caveats = result?.caveats ?? EMPTY_CAVEATS;

  useEffect(() => {
    if (!caveats.some((c) => caveatExpiryMs(c.condition, c.value) !== null)) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [caveats]);

  function changeInput(next: string) {
    setInput(next);
    // Appended caveats are relative to the base macaroon; a new base invalidates them.
    setAdded([]);
    setError(null);
  }

  function addCustom() {
    if (!base) {
      setError("Load a macaroon, challenge, or credential first.");
      return;
    }
    const condition = draft.condition.trim();
    if (!condition) {
      setError("Condition is required.");
      return;
    }
    try {
      // Validate it encodes before appending.
      new Caveat(condition, draft.value).encode();
      setAdded((rows) => [...rows, { condition, value: draft.value }]);
      setDraft({ condition: "", value: "" });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function addTimeLimit() {
    if (!base) {
      setError("Load a macaroon, challenge, or credential first.");
      return;
    }
    const n = parsePositiveIntegerSeconds(seconds);
    if (n === null) {
      setError("Enter a positive whole number of seconds.");
      return;
    }
    const caveat = validUntil({ seconds: n });
    setAdded((rows) => [...rows, { condition: caveat.condition, value: caveat.value }]);
    setSeconds("");
    setError(null);
  }

  function removeAdded(index: number) {
    setAdded((rows) => rows.filter((_, i) => i !== index));
    setError(null);
  }

  function reset() {
    setInput("");
    setAdded([]);
    setDraft({ condition: "", value: "" });
    setSeconds("");
    setError(null);
  }

  const inputError = Boolean(input.trim()) && detected !== null && !detected.ok;
  const status = error || inputError ? "fail" : base ? "pass" : "idle";
  const statusLabel =
    error || inputError
      ? "error"
      : base
        ? `${caveats.length} caveat${caveats.length === 1 ? "" : "s"}`
        : "idle";

  const addedSnippet = added
    .map(
      (c) =>
        `token.addFirstPartyCaveat(new Caveat(${JSON.stringify(c.condition)}, ${JSON.stringify(c.value)}));`,
    )
    .join("\n");
  const snippetMacaroon = JSON.stringify(base?.macaroon ?? "<base64 macaroon>");

  return (
    <Cell
      header={
        <HeaderRow
          title="Caveats"
          subtitle="Load a macaroon, challenge, or credential; inspect its caveats, attenuate with more, and copy the result"
          trailing={
            <StatusPill
              state={status}
              details={
                error ?? (inputError && detected ? describeArtifactError(detected.error) : null)
              }
            >
              {statusLabel}
            </StatusPill>
          }
        />
      }
      body={
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={labelStyle}>
            Macaroon, L402 challenge, or credential
            <textarea
              value={input}
              onChange={(e) => changeInput(e.target.value)}
              placeholder='AgI...   ·   L402 macaroon="...", invoice="..."   ·   L402 &lt;macaroon&gt;:&lt;preimage&gt;'
              data-testid="caveats-input"
              rows={2}
              style={panelTextareaStyle(inputError)}
            />
          </label>

          <div
            data-testid="caveats-workbench-actions"
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
              available={workbenchMemory?.macaroon ?? ""}
              current={input}
              onFill={changeInput}
              testId="caveats-fill-macaroon"
            />
            <FillFromWorkbench
              label="challenge"
              available={workbenchMemory?.challenge ?? ""}
              current={input}
              onFill={changeInput}
              testId="caveats-fill-challenge"
            />
            <FillFromWorkbench
              label="credential"
              available={workbenchMemory?.credential ?? ""}
              current={input}
              onFill={changeInput}
              testId="caveats-fill-credential"
            />
          </div>

          {inputError && detected && !detected.ok ? (
            <div data-testid="caveats-input-error" style={errorStyle}>
              {describeArtifactError(detected.error)}
            </div>
          ) : null}

          {base ? (
            <CurrentCaveats
              caveats={caveats}
              baseCount={baseCaveatCount}
              nowMs={nowMs}
              onRemoveAdded={removeAdded}
            />
          ) : (
            <div data-testid="caveats-empty-hint" style={hintStyle}>
              Paste an artifact above (or fill one from the Workbench) to inspect its caveats.
            </div>
          )}

          {base ? (
            <AddControls
              draft={draft}
              setDraft={setDraft}
              addCustom={addCustom}
              seconds={seconds}
              setSeconds={setSeconds}
              addTimeLimit={addTimeLimit}
              reset={reset}
            />
          ) : null}

          {error ? (
            <div data-testid="caveats-error" style={errorStyle}>
              {error}
            </div>
          ) : null}

          {result ? (
            <div data-testid="caveats-output">
              <BigBlob
                value={result.macaroon}
                label={added.length > 0 ? "Attenuated macaroon" : "Macaroon"}
              />
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          contract={added.length > 0 ? "exact" : "recipe"}
          template={
            added.length > 0
              ? `import { Caveat, L402 } from "@boltwall/l402";\n\nconst token = L402.fromMacaroon({{macaroon}});\n{{added}}\nconst attenuated = token.macaroon; // re-serialized with the appended caveats`
              : `import { Caveat, L402 } from "@boltwall/l402";\n\nconst token = L402.fromMacaroon({{macaroon}});\nconst caveats = token.getCaveats();\n// Append a first-party caveat (no root key needed):\ntoken.addFirstPartyCaveat(new Caveat("services", "my-service:0"));\nconst attenuated = token.macaroon;`
          }
          values={{ macaroon: snippetMacaroon, added: addedSnippet }}
        />
      }
    />
  );
}

function CurrentCaveats({
  caveats,
  baseCount,
  nowMs,
  onRemoveAdded,
}: {
  caveats: CaveatRow[];
  baseCount: number;
  nowMs: number;
  onRemoveAdded: (index: number) => void;
}) {
  return (
    <div
      data-testid="caveats-list"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 10,
        border: "1px solid var(--color-border)",
        background: "var(--color-surface-alt)",
      }}
    >
      <div style={outputLabelStyle}>Caveats</div>
      {caveats.length === 0 ? (
        <div data-testid="caveats-none" style={hintStyle}>
          No caveats on this macaroon yet.
        </div>
      ) : (
        caveats.map((c, i) => {
          const expiryMs = caveatExpiryMs(c.condition, c.value);
          const isAdded = i >= baseCount;
          const addedIndex = i - baseCount;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CaveatPill state={pillState(expiryMs, nowMs)}>
                <span data-testid={`caveat-${i}`}>
                  {c.value === "" ? c.condition : `${c.condition}=${c.value}`}
                </span>
              </CaveatPill>
              {expiryMs !== null ? (
                <span style={timerStyle} data-testid={`caveat-expiry-${i}`}>
                  {expiryMs <= nowMs ? "expired" : `expires ${new Date(expiryMs).toLocaleString()}`}
                </span>
              ) : null}
              {isAdded ? (
                <button
                  type="button"
                  onClick={() => onRemoveAdded(addedIndex)}
                  data-testid={`caveat-remove-${addedIndex}`}
                  aria-label={`Remove added caveat ${c.condition}`}
                  style={removeButtonStyle}
                >
                  x
                </button>
              ) : (
                <span style={{ fontSize: "var(--size-11)", color: "var(--color-dim)" }}>
                  existing
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function AddControls({
  draft,
  setDraft,
  addCustom,
  seconds,
  setSeconds,
  addTimeLimit,
  reset,
}: {
  draft: CaveatRow;
  setDraft: (updater: (d: CaveatRow) => CaveatRow) => void;
  addCustom: () => void;
  seconds: string;
  setSeconds: (value: string) => void;
  addTimeLimit: () => void;
  reset: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={labelStyle}>
          Condition
          <input
            type="text"
            value={draft.condition}
            onChange={(e) => setDraft((d) => ({ ...d, condition: e.target.value }))}
            placeholder="e.g. services"
            data-testid="caveat-condition-input"
            style={{ ...panelInputStyle(), width: 180 }}
          />
        </label>
        <label style={labelStyle}>
          Value
          <input
            type="text"
            value={draft.value}
            onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
            placeholder="e.g. pokedex:0"
            data-testid="caveat-value-input"
            style={{ ...panelInputStyle(), width: 200 }}
          />
        </label>
        <button
          type="button"
          onClick={addCustom}
          data-testid="caveat-add"
          style={primaryButtonStyle}
        >
          Add caveat
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={labelStyle}>
          Time limit (seconds)
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            placeholder="e.g. 3600"
            data-testid="caveat-seconds-input"
            style={{ ...panelInputStyle(), width: 160 }}
          />
        </label>
        <button
          type="button"
          onClick={addTimeLimit}
          data-testid="caveat-add-time-limit"
          style={primaryButtonStyle}
        >
          Add time limit
        </button>
        <button
          type="button"
          onClick={reset}
          data-testid="caveats-reset"
          style={secondaryButtonStyle}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: "var(--size-12)",
  color: "var(--color-dim)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
} as const;

const errorStyle = {
  fontSize: "var(--size-12)",
  color: "var(--color-danger)",
} as const;

const hintStyle = {
  fontSize: "var(--size-12)",
  color: "var(--color-dim)",
} as const;

const outputLabelStyle = {
  fontSize: "var(--size-11)",
  textTransform: "uppercase",
  letterSpacing: 0,
  color: "var(--color-dim)",
  marginBottom: 2,
} as const;

const timerStyle = {
  fontSize: "var(--size-12)",
  color: "var(--color-dim)",
  fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
} as const;

const primaryButtonStyle = {
  padding: "6px 12px",
  background: "var(--color-primary)",
  color: "var(--color-surface)",
  border: "none",
  borderRadius: 4,
  fontSize: "var(--size-13)",
  fontWeight: 500,
  cursor: "pointer",
} as const;

const secondaryButtonStyle = {
  padding: "6px 12px",
  background: "var(--color-surface)",
  color: "var(--color-dim)",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  fontSize: "var(--size-13)",
  fontWeight: 500,
  cursor: "pointer",
} as const;

const removeButtonStyle = {
  padding: "1px 6px",
  fontSize: "var(--size-11)",
  background: "var(--color-danger-soft)",
  color: "var(--color-danger)",
  border: "1px solid var(--color-danger)",
  borderRadius: 4,
  cursor: "pointer",
} as const;

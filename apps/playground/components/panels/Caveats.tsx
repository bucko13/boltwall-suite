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

function buildChallenge(macaroon: string, invoice: string): string {
  return L402.fromMacaroon(macaroon, invoice).toChallenge();
}

function buildCredential(macaroon: string, preimage: string): string {
  return new L402({ macaroons: macaroon, paymentPreimage: preimage }).toToken();
}

function matchingWorkbenchInvoice(challenge: string, macaroon: string): string | null {
  const detected = challenge ? detectArtifact(challenge) : null;
  if (!detected?.ok || detected.value.kind !== "challenge") return null;
  if (detected.value.macaroon !== macaroon) return null;
  return detected.value.token.invoice ?? null;
}

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

function timeState(expiryMs: number | null, nowMs: number): "active" | "expired" | null {
  if (expiryMs === null) return null;
  return expiryMs <= nowMs ? "expired" : "active";
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
  const [workbenchFeedback, setWorkbenchFeedback] = useState<string | null>(null);

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
    setWorkbenchFeedback(null);
    // Reset the add-caveat draft too, so a half-filled condition/value/time-limit
    // from the previous artifact doesn't linger against the new one.
    setDraft({ condition: "", value: "" });
    setSeconds("");
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
      setWorkbenchFeedback(null);
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
    setWorkbenchFeedback(null);
  }

  function removeAdded(index: number) {
    setAdded((rows) => rows.filter((_, i) => i !== index));
    setError(null);
    setWorkbenchFeedback(null);
  }

  function reset() {
    setInput("");
    setAdded([]);
    setDraft({ condition: "", value: "" });
    setSeconds("");
    setError(null);
    setWorkbenchFeedback(null);
  }

  function addToWorkbench() {
    if (!base || !result || !workbenchMemory) return;

    const sourceInvoice =
      base.token.invoice ??
      matchingWorkbenchInvoice(workbenchMemory.challenge, base.macaroon) ??
      null;

    workbenchMemory.setMacaroon(result.macaroon);

    if (base.kind === "macaroon") {
      workbenchMemory.setChallenge(null);
      workbenchMemory.setCredential(null);
      setWorkbenchFeedback("Updated macaroon; cleared challenge and credential.");
      return;
    }

    if (base.kind === "challenge") {
      if (!sourceInvoice) {
        setError("Loaded challenge is missing an invoice.");
        return;
      }
      workbenchMemory.setChallenge(buildChallenge(result.macaroon, sourceInvoice));
      workbenchMemory.setCredential(null);
      setWorkbenchFeedback("Updated macaroon and challenge; cleared credential.");
      return;
    }

    const preimage = base.token.paymentPreimage;
    if (!preimage) {
      setError("Loaded credential is missing a preimage.");
      return;
    }

    workbenchMemory.setCredential(buildCredential(result.macaroon, preimage));
    if (sourceInvoice) {
      workbenchMemory.setChallenge(buildChallenge(result.macaroon, sourceInvoice));
      setWorkbenchFeedback("Updated macaroon, credential, and challenge.");
    } else {
      workbenchMemory.setChallenge(null);
      setWorkbenchFeedback("Updated macaroon and credential; cleared challenge.");
    }
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
          subtitle="Inspect, attenuate, and stage artifacts"
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
            Artifact
            <textarea
              value={input}
              onChange={(e) => changeInput(e.target.value)}
              placeholder="Paste a macaroon, challenge, or credential"
              data-testid="caveats-input"
              rows={3}
              style={{ ...panelTextareaStyle(inputError), minHeight: 88, resize: "vertical" }}
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
            <div
              data-testid="caveats-output"
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <BigBlob
                value={result.macaroon}
                label={added.length > 0 ? "Attenuated macaroon" : "Macaroon"}
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={addToWorkbench}
                  data-testid="caveats-add-workbench"
                  style={secondaryButtonStyle}
                >
                  Add to Workbench
                </button>
                <span
                  aria-live="polite"
                  data-testid="caveats-workbench-feedback"
                  style={{
                    minHeight: 16,
                    color: workbenchFeedback ? "var(--color-accent)" : "transparent",
                    fontSize: "var(--size-12)",
                    opacity: workbenchFeedback ? 1 : 0,
                    transition: "opacity 180ms ease",
                  }}
                >
                  {workbenchFeedback ?? ""}
                </span>
              </div>
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
        gap: 6,
        padding: 12,
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
          const temporalState = timeState(expiryMs, nowMs);
          const temporalTitle =
            expiryMs !== null && expiryMs > nowMs
              ? `expires ${new Date(expiryMs).toLocaleString()}`
              : null;
          const isAdded = i >= baseCount;
          const addedIndex = i - baseCount;
          return (
            <div key={i} data-testid={`caveat-row-${i}`} style={caveatRowStyle}>
              <div data-testid={`caveat-${i}`} style={caveatMainStyle}>
                <CaveatPill state={pillState(expiryMs, nowMs)}>{c.condition}</CaveatPill>
                {c.value !== "" ? (
                  <>
                    <span style={equalsStyle}>=</span>
                    <span title={c.value} style={caveatValueStyle}>
                      {c.value}
                    </span>
                  </>
                ) : null}
              </div>
              <div style={caveatMetaStyle}>
                {temporalState ? (
                  <StateBadge
                    state={temporalState}
                    testId={`caveat-state-${i}`}
                    {...(temporalTitle ? { title: temporalTitle } : {})}
                  >
                    {temporalState}
                  </StateBadge>
                ) : null}
                <StateBadge state={isAdded ? "new" : "existing"} testId={`caveat-origin-${i}`}>
                  {isAdded ? "new" : "existing"}
                </StateBadge>
              </div>
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
              ) : null}
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

function StateBadge({
  state,
  testId,
  title,
  children,
}: {
  state: "active" | "expired" | "existing" | "new";
  testId: string;
  title?: string;
  children: string;
}) {
  return (
    <span data-testid={testId} data-state={state} title={title} style={stateBadgeStyle[state]}>
      {children}
    </span>
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

const caveatRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  alignItems: "center",
  gap: 8,
  minHeight: 32,
} as const;

const caveatMainStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
} as const;

const caveatMetaStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 6,
  minWidth: 0,
} as const;

const equalsStyle = {
  flex: "0 0 auto",
  color: "var(--color-dim)",
  fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
  fontSize: "var(--size-12)",
} as const;

const caveatValueStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--color-text)",
  fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
  fontSize: "var(--size-12)",
} as const;

const badgeBaseStyle = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 20,
  padding: "1px 7px",
  borderRadius: 999,
  border: "1px solid transparent",
  fontSize: "var(--size-11)",
  fontWeight: 500,
  lineHeight: 1.4,
  whiteSpace: "nowrap",
} as const;

const stateBadgeStyle = {
  active: {
    ...badgeBaseStyle,
    background: "var(--color-accent-soft)",
    borderColor: "var(--color-accent)",
    color: "var(--color-accent)",
  },
  expired: {
    ...badgeBaseStyle,
    background: "var(--color-danger-soft)",
    borderColor: "var(--color-danger)",
    color: "var(--color-danger)",
  },
  existing: {
    ...badgeBaseStyle,
    background: "var(--color-surface)",
    borderColor: "var(--color-border)",
    color: "var(--color-dim)",
  },
  new: {
    ...badgeBaseStyle,
    background: "var(--color-primary-soft, var(--color-surface))",
    borderColor: "var(--color-primary)",
    color: "var(--color-primary)",
  },
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
  width: 26,
  height: 26,
  padding: 0,
  fontSize: "var(--size-11)",
  background: "var(--color-danger-soft)",
  color: "var(--color-danger)",
  border: "1px solid var(--color-danger)",
  borderRadius: 4,
  cursor: "pointer",
  lineHeight: 1,
} as const;

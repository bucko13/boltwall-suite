"use client";

import {
  parseCaveat,
  serializeCaveat,
  servicesSatisfier,
  validUntilSatisfier,
  type Caveat,
  type CaveatSatisfier,
} from "@boltwall/l402";
import { useState } from "react";

import { useRememberedStringInput, useUrlInput } from "../../lib/url-state";
import { CaveatPill } from "../ui/caveat-pill";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

import { panelInputStyle, panelOutputStyle, panelTextareaStyle } from "./panel-styles";

const PANEL = "caveats";
const MODES = ["add", "check"] as const;
const ADD_KINDS = ["custom", "time-limit"] as const;

type CaveatMode = (typeof MODES)[number];
type AddKind = (typeof ADD_KINDS)[number];
type CaveatRow = { condition: string; value: string };
type SatisfierRow = {
  name: BuiltinSatisfier | string;
  param?: string;
};

const BUILTIN_SATISFIERS = ["valid-until", "services"] as const;
type BuiltinSatisfier = (typeof BUILTIN_SATISFIERS)[number];

function rowsToJson(rows: CaveatRow[]): string | null {
  if (rows.length === 0) return null;
  return JSON.stringify(rows);
}

function jsonToRows(raw: string | null): CaveatRow[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (r) =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as Record<string, unknown>)["condition"] === "string" &&
          typeof (r as Record<string, unknown>)["value"] === "string",
      )
    ) {
      return parsed as CaveatRow[];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function satisfiersToJson(rows: SatisfierRow[]): string | null {
  if (rows.length === 0) return null;
  return JSON.stringify(rows);
}

function jsonToSatisfiers(raw: string | null): SatisfierRow[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (r) =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as Record<string, unknown>)["name"] === "string",
      )
    ) {
      return parsed as SatisfierRow[];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function parseMode(raw: string | null): CaveatMode {
  return MODES.includes(raw as CaveatMode) ? (raw as CaveatMode) : "add";
}

function parseAddKind(raw: string | null): AddKind {
  return ADD_KINDS.includes(raw as AddKind) ? (raw as AddKind) : "custom";
}

function base64ToBytes(b64: string): Uint8Array {
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

function extractCaveatsFromMacaroon(macaroon: string): CaveatRow[] {
  try {
    const macBytes = base64ToBytes(macaroon);
    const dec = new TextDecoder();
    const caveats: CaveatRow[] = [];

    if (macBytes.length < 1 || macBytes[0] !== 2) return caveats;
    let pos = 1;

    function readVarint(): number {
      let result = 0;
      let shift = 0;
      while (pos < macBytes.length) {
        const b = macBytes[pos++] ?? 0;
        result |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      return result;
    }

    while (pos < macBytes.length) {
      const tag = macBytes[pos++];
      if (tag === 0) break;
      if (tag === 6) return caveats;
      const len = readVarint();
      pos += len;
    }

    while (pos < macBytes.length) {
      const tag = macBytes[pos];
      if (tag === 0 || tag === 6) break;
      pos++;
      const len = readVarint();
      const fieldBytes = macBytes.slice(pos, pos + len);
      pos += len;
      if (macBytes[pos] === 0) pos++;
      if (tag === 2) {
        const text = dec.decode(fieldBytes);
        try {
          const parsed = parseCaveat(text);
          caveats.push({ condition: parsed.condition, value: parsed.value });
        } catch {
          caveats.push({ condition: text, value: "" });
        }
      }
    }
    return caveats;
  } catch {
    return [];
  }
}

function buildSatisfier(row: SatisfierRow): CaveatSatisfier | null {
  if (row.name === "valid-until") return validUntilSatisfier();
  if (row.name === "services") return servicesSatisfier(row.param ?? "");
  return null;
}

async function runSatisfiers(
  caveats: CaveatRow[],
  satisfierRows: SatisfierRow[],
): Promise<Record<string, "matched" | "unsatisfied">> {
  const result: Record<string, "matched" | "unsatisfied"> = {};
  for (const c of caveats) {
    const key = `${c.condition}=${c.value}`;
    let matched = false;
    for (const row of satisfierRows) {
      const satisfier = buildSatisfier(row);
      if (!satisfier) continue;
      const condMatch =
        satisfier.condition instanceof RegExp
          ? satisfier.condition.test(c.condition)
          : satisfier.condition === c.condition;
      if (!condMatch) continue;
      try {
        const ok = await satisfier.satisfyFinal(
          { condition: c.condition, value: c.value },
          { now: new Date() },
        );
        if (ok) {
          matched = true;
          break;
        }
      } catch {
        /* ignore */
      }
    }
    result[key] = matched ? "matched" : "unsatisfied";
  }
  return result;
}

function modeLabel(mode: CaveatMode) {
  return mode === "add" ? "Add" : "Check";
}

function addKindLabel(kind: AddKind) {
  return kind === "custom" ? "Custom" : "Time limit";
}

export function Caveats() {
  const [mode, setMode] = useUrlInput<CaveatMode>("mode", parseMode, (v) => v, { panel: PANEL });
  const activeMode = mode ?? "add";
  const [addKind, setAddKind] = useUrlInput<AddKind>("kind", parseAddKind, (v) => v, {
    panel: PANEL,
  });
  const activeAddKind = addKind ?? "custom";

  const [caveatsJson, setCaveatsJson] = useUrlInput<string>(
    "caveats",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );
  const rows = jsonToRows(caveatsJson || null);

  const [draft, setDraft] = useState<CaveatRow>({ condition: "", value: "" });
  const [draftError, setDraftError] = useState<string | null>(null);

  const [seconds, setSeconds] = useUrlInput<string>(
    "seconds",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );
  const [expirationResult, setExpirationResult] = useState<{
    condition: string;
    value: string;
    serialized: string;
  } | null>(null);
  const [expirationError, setExpirationError] = useState<string | null>(null);

  const [token, setToken] = useRememberedStringInput("token", {
    panel: PANEL,
    field: "macaroon",
  });
  const [satisfiersJson, setSatisfiersJson] = useUrlInput<string>(
    "satisfiers",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );
  const satisfierRows = jsonToSatisfiers(satisfiersJson || null);
  const [results, setResults] = useState<Record<string, "matched" | "unsatisfied"> | null>(null);
  const [satisfyError, setSatisfyError] = useState<string | null>(null);
  const [newSatisfier, setNewSatisfier] = useState<SatisfierRow>({
    name: "valid-until",
    param: "",
  });

  function saveRows(newRows: CaveatRow[]) {
    setCaveatsJson(rowsToJson(newRows));
  }

  function addRow() {
    if (!draft.condition.trim()) {
      setDraftError("Condition is required.");
      return;
    }
    try {
      const serialized = `${draft.condition.trim()}=${draft.value}`;
      parseCaveat(serialized);
      const newRows = [...rows, { condition: draft.condition.trim(), value: draft.value }];
      saveRows(newRows);
      setDraft({ condition: "", value: "" });
      setDraftError(null);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
    }
  }

  function removeRow(i: number) {
    saveRows(rows.filter((_, idx) => idx !== i));
  }

  function resetRows() {
    setCaveatsJson(null);
    setDraft({ condition: "", value: "" });
    setDraftError(null);
  }

  function addTimeLimit() {
    const n = parseInt(seconds ?? "", 10);
    if (isNaN(n) || n < 0) {
      setExpirationError("Enter a positive number of seconds.");
      setExpirationResult(null);
      return;
    }
    const expiresAt = new Date(Date.now() + n * 1000).toISOString();
    const caveat: Caveat = {
      condition: "valid-until",
      value: expiresAt,
    };
    setExpirationResult({
      condition: caveat.condition,
      value: caveat.value,
      serialized: `${caveat.condition}=${caveat.value}`,
    });
    saveRows([...rows, { condition: caveat.condition, value: caveat.value }]);
    setExpirationError(null);
  }

  function resetExpiration() {
    setSeconds(null);
    setExpirationResult(null);
    setExpirationError(null);
  }

  function addSatisfier() {
    setSatisfiersJson(satisfiersToJson([...satisfierRows, newSatisfier]));
    setResults(null);
  }

  function removeSatisfier(i: number) {
    setSatisfiersJson(satisfiersToJson(satisfierRows.filter((_, idx) => idx !== i)));
    setResults(null);
  }

  async function runCheck() {
    try {
      const tokenRows = (token ?? "").trim()
        ? extractCaveatsFromMacaroon((token ?? "").trim())
        : [];
      const caveats = rows.length > 0 ? rows : tokenRows;
      if (caveats.length === 0) {
        setSatisfyError("Add caveats or paste a base64-encoded macaroon.");
        setResults(null);
        return;
      }
      const res = await runSatisfiers(caveats, satisfierRows);
      setResults(res);
      setSatisfyError(null);
    } catch (e) {
      setSatisfyError(e instanceof Error ? e.message : String(e));
      setResults(null);
    }
  }

  function resetSatisfy() {
    setToken(null);
    setSatisfiersJson(null);
    setResults(null);
    setSatisfyError(null);
  }

  const serialized = rows.map((r) => serializeCaveat({ condition: r.condition, value: r.value }));
  const draftSnippetRows = draft.condition.trim()
    ? [{ condition: draft.condition.trim(), value: draft.value }]
    : [];
  const snippetRows = rows.length > 0 ? rows : draftSnippetRows;
  const caveatsLiteral = JSON.stringify(snippetRows, null, 2);
  const ttlSecondsLiteral = /^[0-9]+$/.test(seconds ?? "") ? (seconds ?? "") : "3600";
  const caveatValueLiteral = JSON.stringify(expirationResult?.value ?? "");
  const satisfiersSource = satisfierRows
    .map((row) =>
      row.name === "services"
        ? `  servicesSatisfier(${JSON.stringify(row.param ?? "")})`
        : "  validUntilSatisfier()",
    )
    .join(",\n");

  const status = getStatus(
    activeMode,
    rows.length,
    expirationError,
    results,
    satisfyError,
    draftError,
  );
  const statusLabel = getStatusLabel(
    activeMode,
    rows.length,
    expirationError,
    results,
    satisfyError,
    draftError,
  );

  return (
    <Cell
      header={
        <HeaderRow
          title="Caveats"
          subtitle="Add caveats, create time limits, and check satisfiers"
          trailing={
            <>
              <StatusPill state={status} details={expirationError ?? satisfyError ?? draftError}>
                {statusLabel}
              </StatusPill>
              <CopyUrlButton />
            </>
          }
        />
      }
      body={
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            role="tablist"
            aria-label="Caveat tools"
            style={{
              display: "inline-flex",
              alignSelf: "flex-start",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface-alt)",
            }}
          >
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={activeMode === m}
                onClick={() => setMode(m)}
                data-testid={`caveats-mode-${m}`}
                style={{
                  padding: "6px 10px",
                  border: "none",
                  borderRight: m === "check" ? "none" : "1px solid var(--color-border)",
                  background: activeMode === m ? "var(--color-primary)" : "transparent",
                  color: activeMode === m ? "var(--color-surface)" : "var(--color-dim)",
                  cursor: "pointer",
                  fontSize: "var(--size-12)",
                  fontWeight: activeMode === m ? 600 : 500,
                }}
              >
                {modeLabel(m)}
              </button>
            ))}
          </div>

          <CurrentCaveats rows={rows} serialized={serialized} removeRow={removeRow} />

          {activeMode === "add" ? (
            <>
              <div
                role="tablist"
                aria-label="Caveat add options"
                style={{
                  display: "inline-flex",
                  alignSelf: "flex-start",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-alt)",
                }}
              >
                {ADD_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="tab"
                    aria-selected={activeAddKind === kind}
                    onClick={() => setAddKind(kind)}
                    data-testid={`caveats-add-kind-${kind}`}
                    style={{
                      padding: "6px 10px",
                      border: "none",
                      borderRight: kind === "time-limit" ? "none" : "1px solid var(--color-border)",
                      background: activeAddKind === kind ? "var(--color-primary)" : "transparent",
                      color: activeAddKind === kind ? "var(--color-surface)" : "var(--color-dim)",
                      cursor: "pointer",
                      fontSize: "var(--size-12)",
                      fontWeight: activeAddKind === kind ? 600 : 500,
                    }}
                  >
                    {addKindLabel(kind)}
                  </button>
                ))}
              </div>

              {activeAddKind === "custom" ? (
                <BuildMode
                  draft={draft}
                  draftError={draftError}
                  setDraft={setDraft}
                  addRow={addRow}
                  resetRows={resetRows}
                />
              ) : (
                <TimeLimitMode
                  seconds={seconds ?? ""}
                  result={expirationResult}
                  error={expirationError}
                  setSeconds={(value) => {
                    setSeconds(value);
                    setExpirationResult(null);
                    setExpirationError(null);
                  }}
                  addTimeLimit={addTimeLimit}
                  reset={resetExpiration}
                />
              )}
            </>
          ) : null}

          {activeMode === "check" ? (
            <CheckMode
              caveatCount={rows.length}
              token={token ?? ""}
              setToken={(value) => {
                setToken(value);
                setResults(null);
                setSatisfyError(null);
              }}
              satisfierRows={satisfierRows}
              newSatisfier={newSatisfier}
              setNewSatisfier={setNewSatisfier}
              addSatisfier={addSatisfier}
              removeSatisfier={removeSatisfier}
              runCheck={runCheck}
              reset={resetSatisfy}
              error={satisfyError}
              results={results}
            />
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          contract={
            activeMode === "add" && activeAddKind === "time-limit" && !expirationResult
              ? "recipe"
              : "exact"
          }
          template={
            activeMode === "add" && activeAddKind === "custom"
              ? `import { serializeCaveat, type Caveat } from "@boltwall/l402";\n\nconst caveats = {{caveatsLiteral}} satisfies Caveat[];\nconst serialized = caveats.map((caveat) => serializeCaveat(caveat));`
              : activeMode === "add" && activeAddKind === "time-limit"
                ? expirationResult
                  ? `import type { Caveat } from "@boltwall/l402";\n\nconst caveat: Caveat = {\n  condition: "valid-until",\n  value: {{caveatValueLiteral}},\n};`
                  : `import type { Caveat } from "@boltwall/l402";\n\nconst ttlSeconds = {{seconds}};\nconst caveat: Caveat = {\n  condition: "valid-until",\n  value: new Date(Date.now() + ttlSeconds * 1000).toISOString(),\n};`
                : satisfierRows.length > 0
                  ? `import { servicesSatisfier, validUntilSatisfier, type Caveat } from "@boltwall/l402";\n\nconst caveats = {{caveatsLiteral}} satisfies Caveat[];\nconst satisfiers = [\n{{satisfiersSource}},\n];\n\n// Pass caveats embedded in a macaroon to verifyMacaroon({ ..., satisfiers }).`
                  : `import type { Caveat } from "@boltwall/l402";\n\nconst caveats = {{caveatsLiteral}} satisfies Caveat[];\nconst satisfiers = [];\n\n// Add satisfiers to check these caveats.`
          }
          values={{
            caveatsLiteral,
            seconds: ttlSecondsLiteral,
            caveatValueLiteral,
            satisfiersSource,
          }}
        />
      }
    />
  );
}

function getStatus(
  mode: CaveatMode,
  rowCount: number,
  expirationError: string | null,
  results: Record<string, "matched" | "unsatisfied"> | null,
  satisfyError: string | null,
  draftError: string | null,
) {
  if (mode === "add")
    return draftError || expirationError ? "fail" : rowCount > 0 ? "pass" : "idle";
  if (satisfyError) return "fail";
  if (!results) return "idle";
  return Object.values(results).every((v) => v === "matched") ? "pass" : "warn";
}

function getStatusLabel(
  mode: CaveatMode,
  rowCount: number,
  expirationError: string | null,
  results: Record<string, "matched" | "unsatisfied"> | null,
  satisfyError: string | null,
  draftError: string | null,
) {
  if (mode === "add") {
    if (draftError || expirationError) return "error";
    return rowCount > 0 ? `${rowCount} caveat${rowCount > 1 ? "s" : ""}` : "idle";
  }
  if (satisfyError) return "error";
  if (!results) return "idle";
  return `${Object.values(results).filter((v) => v === "matched").length}/${Object.keys(results).length} matched`;
}

function CurrentCaveats({
  rows,
  serialized,
  removeRow,
}: {
  rows: CaveatRow[];
  serialized: string[];
  removeRow: (index: number) => void;
}) {
  return (
    <div
      data-testid="caveats-shared-list"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 10,
        border: "1px solid var(--color-border)",
        background: "var(--color-surface-alt)",
      }}
    >
      <div style={outputLabelStyle}>Current caveats</div>
      {rows.length > 0 ? (
        <>
          <div
            data-testid="caveats-list"
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CaveatPill state="unsatisfied">
                  {r.condition}={r.value}
                </CaveatPill>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  data-testid={`caveat-remove-${i}`}
                  aria-label={`Remove caveat ${r.condition}`}
                  style={removeButtonStyle}
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <div data-testid="caveats-output" style={monoOutputStyle}>
            <div style={outputLabelStyle}>Serialized caveats</div>
            {serialized.map((s, i) => (
              <div key={i} style={{ color: "var(--color-text)" }}>
                {s}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div
          data-testid="caveats-empty"
          style={{ fontSize: "var(--size-12)", color: "var(--color-dim)" }}
        >
          No caveats
        </div>
      )}
    </div>
  );
}

function BuildMode({
  draft,
  draftError,
  setDraft,
  addRow,
  resetRows,
}: {
  draft: CaveatRow;
  draftError: string | null;
  setDraft: (updater: (draft: CaveatRow) => CaveatRow) => void;
  addRow: () => void;
  resetRows: () => void;
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
            style={{
              ...panelInputStyle(Boolean(draftError)),
              width: 180,
            }}
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
            style={{
              ...panelInputStyle(Boolean(draftError)),
              width: 200,
            }}
          />
        </label>

        <button type="button" onClick={addRow} data-testid="caveat-add" style={primaryButtonStyle}>
          Add
        </button>
        <button
          type="button"
          onClick={resetRows}
          data-testid="caveats-reset"
          style={secondaryButtonStyle}
        >
          Reset
        </button>
      </div>

      {draftError ? (
        <div
          data-testid="caveats-error"
          style={{ fontSize: "var(--size-12)", color: "var(--color-danger)" }}
        >
          {draftError}
        </div>
      ) : null}
    </div>
  );
}

function TimeLimitMode({
  seconds,
  result,
  error,
  setSeconds,
  addTimeLimit,
  reset,
}: {
  seconds: string;
  result: { condition: string; value: string; serialized: string } | null;
  error: string | null;
  setSeconds: (value: string | null) => void;
  addTimeLimit: () => void;
  reset: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={labelStyle}>
          TTL in seconds
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            placeholder="e.g. 3600"
            data-testid="expiration-seconds-input"
            style={{
              ...panelInputStyle(Boolean(error)),
              width: 160,
            }}
          />
        </label>
        <button
          type="button"
          onClick={addTimeLimit}
          data-testid="expiration-compute"
          style={primaryButtonStyle}
        >
          Add time limit
        </button>
        <button
          type="button"
          onClick={reset}
          data-testid="expiration-reset"
          style={secondaryButtonStyle}
        >
          Reset
        </button>
      </div>

      {error ? (
        <div
          data-testid="expiration-error"
          style={{ fontSize: "var(--size-12)", color: "var(--color-danger)" }}
        >
          {error}
        </div>
      ) : null}

      {result ? (
        <div
          data-testid="expiration-output"
          style={{ display: "flex", flexDirection: "column", gap: 8, ...monoOutputStyle }}
        >
          <div style={outputLabelStyle}>Last added time limit</div>
          <div>
            <span style={{ color: "var(--color-dim)" }}>condition: </span>
            <span style={{ color: "var(--color-accent)" }}>{result.condition}</span>
          </div>
          <div>
            <span style={{ color: "var(--color-dim)" }}>value: </span>
            <span style={{ color: "var(--color-text)" }}>{result.value}</span>
          </div>
          <div>
            <span style={{ color: "var(--color-dim)" }}>serialized: </span>
            <span style={{ color: "var(--color-text)" }}>{result.serialized}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CheckMode({
  caveatCount,
  token,
  setToken,
  satisfierRows,
  newSatisfier,
  setNewSatisfier,
  addSatisfier,
  removeSatisfier,
  runCheck,
  reset,
  error,
  results,
}: {
  caveatCount: number;
  token: string;
  setToken: (value: string | null) => void;
  satisfierRows: SatisfierRow[];
  newSatisfier: SatisfierRow;
  setNewSatisfier: (updater: (row: SatisfierRow) => SatisfierRow) => void;
  addSatisfier: () => void;
  removeSatisfier: (index: number) => void;
  runCheck: () => void;
  reset: () => void;
  error: string | null;
  results: Record<string, "matched" | "unsatisfied"> | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={labelStyle}>
        Macaroon caveats (optional)
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="AGIAJEemVQUTEyNCR0exk7ek90Cg=="
          data-testid="satisfy-token-input"
          rows={2}
          style={panelTextareaStyle(Boolean(error))}
        />
      </label>
      <div
        data-testid="satisfy-source"
        style={{ fontSize: "var(--size-12)", color: "var(--color-dim)" }}
      >
        Source: {caveatCount > 0 ? "current caveats" : "macaroon caveats"}
      </div>

      {satisfierRows.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={outputLabelStyle}>Satisfiers</div>
          {satisfierRows.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                  fontSize: "var(--size-12-5)",
                  color: "var(--color-primary)",
                }}
              >
                {r.name}
                {r.param ? `(${r.param})` : ""}
              </span>
              <button
                type="button"
                onClick={() => removeSatisfier(i)}
                data-testid={`satisfy-remove-${i}`}
                style={{
                  padding: "1px 6px",
                  fontSize: "var(--size-11)",
                  background: "var(--color-danger-soft)",
                  color: "var(--color-danger)",
                  border: "1px solid var(--color-danger)",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={labelStyle}>
          Satisfier
          <select
            value={newSatisfier.name}
            onChange={(e) =>
              setNewSatisfier((s) => ({ ...s, name: e.target.value as BuiltinSatisfier }))
            }
            data-testid="satisfy-satisfier-select"
            style={panelInputStyle()}
          >
            {BUILTIN_SATISFIERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {newSatisfier.name === "services" ? (
          <label style={labelStyle}>
            Target service
            <input
              type="text"
              value={newSatisfier.param ?? ""}
              onChange={(e) => setNewSatisfier((s) => ({ ...s, param: e.target.value }))}
              placeholder="e.g. pokedex"
              data-testid="satisfy-satisfier-param"
              style={{
                ...panelInputStyle(),
                width: 160,
              }}
            />
          </label>
        ) : null}
        <button
          type="button"
          onClick={addSatisfier}
          data-testid="satisfy-add-satisfier"
          style={secondaryButtonStyle}
        >
          + Satisfier
        </button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={runCheck}
          data-testid="satisfy-run"
          style={primaryButtonStyle}
        >
          Check
        </button>
        <button
          type="button"
          onClick={reset}
          data-testid="satisfy-reset"
          style={secondaryButtonStyle}
        >
          Reset
        </button>
      </div>

      {error ? (
        <div
          data-testid="satisfy-error"
          style={{ fontSize: "var(--size-12)", color: "var(--color-danger)" }}
        >
          {error}
        </div>
      ) : null}

      {results ? (
        <div
          data-testid="satisfy-output"
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          {Object.entries(results).map(([key, state]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CaveatPill state={state}>{key}</CaveatPill>
              <span
                style={{
                  fontSize: "var(--size-12)",
                  color: state === "matched" ? "var(--color-accent)" : "var(--color-dim)",
                }}
              >
                {state}
              </span>
            </div>
          ))}
        </div>
      ) : null}
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

const monoOutputStyle = {
  ...panelOutputStyle(),
  fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
  fontSize: "var(--size-12-5)",
  color: "var(--color-dim)",
} as const;

const outputLabelStyle = {
  fontSize: "var(--size-11)",
  textTransform: "uppercase",
  letterSpacing: 0,
  color: "var(--color-dim)",
  marginBottom: 2,
} as const;

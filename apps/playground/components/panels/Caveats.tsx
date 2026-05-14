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
const MODES = ["build", "valid-until", "satisfy"] as const;

type CaveatMode = (typeof MODES)[number];
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
  return MODES.includes(raw as CaveatMode) ? (raw as CaveatMode) : "build";
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
  if (mode === "build") return "Build";
  if (mode === "valid-until") return "Valid-until";
  return "Satisfy";
}

export function Caveats() {
  const [mode, setMode] = useUrlInput<CaveatMode>("mode", parseMode, (v) => v, { panel: PANEL });
  const activeMode = mode ?? "build";

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

  function computeExpiration() {
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
    setExpirationError(null);
  }

  function addExpirationToRows() {
    if (!expirationResult) return;
    saveRows([...rows, { condition: expirationResult.condition, value: expirationResult.value }]);
    setMode("build");
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
    if (!(token ?? "").trim()) {
      setSatisfyError("Paste a base64-encoded macaroon.");
      setResults(null);
      return;
    }
    try {
      const caveats = extractCaveatsFromMacaroon((token ?? "").trim());
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
    expirationResult,
    expirationError,
    results,
    satisfyError,
  );
  const statusLabel = getStatusLabel(
    activeMode,
    rows.length,
    expirationResult,
    expirationError,
    results,
    satisfyError,
  );

  return (
    <Cell
      header={
        <HeaderRow
          title="Caveats"
          subtitle="Build caveats, create time limits, and test satisfiers"
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
                  borderRight: m === "satisfy" ? "none" : "1px solid var(--color-border)",
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

          {activeMode === "build" ? (
            <BuildMode
              rows={rows}
              draft={draft}
              draftError={draftError}
              serialized={serialized}
              setDraft={setDraft}
              addRow={addRow}
              removeRow={removeRow}
              resetRows={resetRows}
            />
          ) : null}

          {activeMode === "valid-until" ? (
            <ValidUntilMode
              seconds={seconds ?? ""}
              result={expirationResult}
              error={expirationError}
              setSeconds={(value) => {
                setSeconds(value);
                setExpirationResult(null);
                setExpirationError(null);
              }}
              compute={computeExpiration}
              addToRows={addExpirationToRows}
              reset={resetExpiration}
            />
          ) : null}

          {activeMode === "satisfy" ? (
            <SatisfyMode
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
          contract={activeMode === "valid-until" && !expirationResult ? "recipe" : "exact"}
          template={
            activeMode === "build"
              ? `import { serializeCaveat, type Caveat } from "@boltwall/l402";\n\nconst caveats = {{caveatsLiteral}} satisfies Caveat[];\nconst serialized = caveats.map((caveat) => serializeCaveat(caveat));`
              : activeMode === "valid-until"
                ? expirationResult
                  ? `import type { Caveat } from "@boltwall/l402";\n\nconst caveat: Caveat = {\n  condition: "valid-until",\n  value: {{caveatValueLiteral}},\n};`
                  : `import type { Caveat } from "@boltwall/l402";\n\nconst ttlSeconds = {{seconds}};\nconst caveat: Caveat = {\n  condition: "valid-until",\n  value: new Date(Date.now() + ttlSeconds * 1000).toISOString(),\n};`
                : satisfierRows.length > 0
                  ? `import { validUntilSatisfier, servicesSatisfier } from "@boltwall/l402";\n\nconst satisfiers = [\n{{satisfiersSource}},\n];\n\n// Pass to verifyMacaroon({ ..., satisfiers })`
                  : `const satisfiers = [];\n\n// Pass to verifyMacaroon({ ..., satisfiers })`
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
  expirationResult: { serialized: string } | null,
  expirationError: string | null,
  results: Record<string, "matched" | "unsatisfied"> | null,
  satisfyError: string | null,
) {
  if (mode === "build") return rowCount > 0 ? "pass" : "idle";
  if (mode === "valid-until") return expirationError ? "fail" : expirationResult ? "pass" : "idle";
  if (satisfyError) return "fail";
  if (!results) return "idle";
  return Object.values(results).every((v) => v === "matched") ? "pass" : "warn";
}

function getStatusLabel(
  mode: CaveatMode,
  rowCount: number,
  expirationResult: { serialized: string } | null,
  expirationError: string | null,
  results: Record<string, "matched" | "unsatisfied"> | null,
  satisfyError: string | null,
) {
  if (mode === "build") {
    return rowCount > 0 ? `${rowCount} caveat${rowCount > 1 ? "s" : ""}` : "idle";
  }
  if (mode === "valid-until")
    return expirationError ? "error" : expirationResult ? "ready" : "idle";
  if (satisfyError) return "error";
  if (!results) return "idle";
  return `${Object.values(results).filter((v) => v === "matched").length}/${Object.keys(results).length} matched`;
}

function BuildMode({
  rows,
  draft,
  draftError,
  serialized,
  setDraft,
  addRow,
  removeRow,
  resetRows,
}: {
  rows: CaveatRow[];
  draft: CaveatRow;
  draftError: string | null;
  serialized: string[];
  setDraft: (updater: (draft: CaveatRow) => CaveatRow) => void;
  addRow: () => void;
  removeRow: (index: number) => void;
  resetRows: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.length > 0 ? (
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

      {serialized.length > 0 ? (
        <div data-testid="caveats-output" style={monoOutputStyle}>
          <div style={outputLabelStyle}>Serialized caveats</div>
          {serialized.map((s, i) => (
            <div key={i} style={{ color: "var(--color-text)" }}>
              {s}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ValidUntilMode({
  seconds,
  result,
  error,
  setSeconds,
  compute,
  addToRows,
  reset,
}: {
  seconds: string;
  result: { condition: string; value: string; serialized: string } | null;
  error: string | null;
  setSeconds: (value: string | null) => void;
  compute: () => void;
  addToRows: () => void;
  reset: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={labelStyle}>
        TTL in seconds
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="number"
            min={0}
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            placeholder="e.g. 3600"
            data-testid="expiration-seconds-input"
            style={{
              ...panelInputStyle(Boolean(error)),
              width: 160,
            }}
          />
          <button
            type="button"
            onClick={compute}
            data-testid="expiration-compute"
            style={primaryButtonStyle}
          >
            Build Caveat
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
      </label>

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
          <button
            type="button"
            onClick={addToRows}
            data-testid="expiration-add-to-caveats"
            style={{ ...secondaryButtonStyle, alignSelf: "flex-start" }}
          >
            Add to builder
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SatisfyMode({
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
        Macaroon (base64)
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="AGIAJEemVQUTEyNCR0exk7ek90Cg=="
          data-testid="satisfy-token-input"
          rows={2}
          style={panelTextareaStyle(Boolean(error))}
        />
      </label>

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

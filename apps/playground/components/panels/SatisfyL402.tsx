"use client";

import {
  inspectMacaroon,
  validUntilSatisfier,
  servicesSatisfier,
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

import { panelInputStyle, panelTextareaStyle } from "./panel-styles";

const PANEL = "satisfy";

const BUILTIN_SATISFIERS = ["valid-until", "services"] as const;
type BuiltinSatisfier = (typeof BUILTIN_SATISFIERS)[number];

type SatisfierRow = {
  name: BuiltinSatisfier | string;
  param?: string;
};

function rowsToJson(rows: SatisfierRow[]): string | null {
  if (rows.length === 0) return null;
  return JSON.stringify(rows);
}

function jsonToRows(raw: string | null): SatisfierRow[] {
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

function extractCaveatsFromMacaroon(macaroon: string): Array<{ condition: string; value: string }> {
  try {
    return inspectMacaroon(macaroon).caveats.map(({ condition, value }) => ({ condition, value }));
  } catch {
    return [];
  }
}

function buildSatisfier(row: SatisfierRow): CaveatSatisfier | null {
  if (row.name === "valid-until") return validUntilSatisfier();
  if (row.name === "services") {
    return servicesSatisfier(row.param ?? "");
  }
  return null;
}

async function runSatisfiers(
  caveats: Array<{ condition: string; value: string }>,
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

export function SatisfyL402() {
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

  const satisfierRows = jsonToRows(satisfiersJson || null);

  const [results, setResults] = useState<Record<string, "matched" | "unsatisfied"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newSatisfier, setNewSatisfier] = useState<SatisfierRow>({
    name: "valid-until",
    param: "",
  });

  function addSatisfier() {
    const newRows = [...satisfierRows, newSatisfier];
    setSatisfiersJson(rowsToJson(newRows));
    setResults(null);
  }

  function removeSatisfier(i: number) {
    const newRows = satisfierRows.filter((_, idx) => idx !== i);
    setSatisfiersJson(rowsToJson(newRows));
    setResults(null);
  }

  async function runCheck() {
    if (!(token ?? "").trim()) {
      setError("Paste a base64-encoded macaroon.");
      setResults(null);
      return;
    }
    try {
      const caveats = extractCaveatsFromMacaroon((token ?? "").trim());
      const res = await runSatisfiers(caveats, satisfierRows);
      setResults(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults(null);
    }
  }

  function reset() {
    setToken(null);
    setSatisfiersJson(null);
    setResults(null);
    setError(null);
  }

  const status = error
    ? "fail"
    : results
      ? Object.values(results).every((v) => v === "matched")
        ? "pass"
        : "warn"
      : "idle";
  const statusLabel = error
    ? "error"
    : results
      ? `${Object.values(results).filter((v) => v === "matched").length}/${Object.keys(results).length} matched`
      : "idle";
  const satisfiersSource = satisfierRows
    .map((row) =>
      row.name === "services"
        ? `  servicesSatisfier(${JSON.stringify(row.param ?? "")})`
        : "  validUntilSatisfier()",
    )
    .join(",\n");
  const hasSatisfiers = satisfierRows.length > 0;

  return (
    <Cell
      header={
        <HeaderRow
          title="Caveat Satisfiers"
          subtitle="Register satisfiers and test token caveats"
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
            Macaroon (base64)
            <textarea
              value={token ?? ""}
              onChange={(e) => {
                setToken(e.target.value);
                setResults(null);
                setError(null);
              }}
              placeholder="AGIAJEemVQUTEyNCR0exk7ek90Cg=="
              data-testid="satisfy-token-input"
              rows={2}
              style={{
                ...panelTextareaStyle(Boolean(error)),
              }}
            />
          </label>

          {/* Satisfier list */}
          {satisfierRows.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  fontSize: "var(--size-11)",
                  textTransform: "uppercase",
                  letterSpacing: 0,
                  color: "var(--color-dim)",
                }}
              >
                Satisfiers
              </div>
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

          {/* Add satisfier */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-dim)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              Satisfier
              <select
                value={newSatisfier.name}
                onChange={(e) =>
                  setNewSatisfier((s) => ({ ...s, name: e.target.value as BuiltinSatisfier }))
                }
                data-testid="satisfy-satisfier-select"
                style={{
                  ...panelInputStyle(),
                }}
              >
                {BUILTIN_SATISFIERS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {newSatisfier.name === "services" ? (
              <label
                style={{
                  fontSize: "var(--size-12)",
                  color: "var(--color-dim)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
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
              style={{
                padding: "6px 12px",
                background: "var(--color-surface-alt)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
                fontSize: "var(--size-13)",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              + Satisfier
            </button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={runCheck}
              data-testid="satisfy-run"
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
              Check
            </button>
            <button
              type="button"
              onClick={reset}
              data-testid="satisfy-reset"
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
              data-testid="satisfy-error"
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-danger)",
              }}
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
      }
      code={
        <CodeSnippet
          language="typescript"
          contract="exact"
          template={
            hasSatisfiers
              ? `import { validUntilSatisfier, servicesSatisfier } from "@boltwall/l402";\n\nconst satisfiers = [\n{{satisfiersSource}},\n];\n\n// Pass to verifyMacaroon({ ..., satisfiers })`
              : `const satisfiers = [];\n\n// Pass to verifyMacaroon({ ..., satisfiers })`
          }
          values={{ satisfiersSource }}
        />
      }
    />
  );
}

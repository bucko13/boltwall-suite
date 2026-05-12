"use client";

import { parseCaveat, serializeCaveat } from "@boltwall/l402";
import { useState } from "react";

import { useUrlInput } from "../../lib/url-state";
import { CaveatPill } from "../ui/caveat-pill";
import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { CopyUrlButton } from "../ui/copy-url-button";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

import { panelInputStyle, panelOutputStyle } from "./panel-styles";

const PANEL = "caveats";

type CaveatRow = { condition: string; value: string };

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

export function Caveats() {
  const [caveatsJson, setCaveatsJson] = useUrlInput<string>(
    "caveats",
    (raw) => raw ?? "",
    (v) => v || null,
    { panel: PANEL },
  );

  const rows = jsonToRows(caveatsJson || null);

  const [draft, setDraft] = useState<CaveatRow>({ condition: "", value: "" });
  const [draftError, setDraftError] = useState<string | null>(null);

  function saveRows(newRows: CaveatRow[]) {
    setCaveatsJson(rowsToJson(newRows));
  }

  function addRow() {
    if (!draft.condition.trim()) {
      setDraftError("Condition is required.");
      return;
    }
    try {
      // Validate via serialize+parse round-trip
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
    const newRows = rows.filter((_, idx) => idx !== i);
    saveRows(newRows);
  }

  function reset() {
    setCaveatsJson(null);
    setDraft({ condition: "", value: "" });
    setDraftError(null);
  }

  const serialized = rows.map((r) => serializeCaveat({ condition: r.condition, value: r.value }));
  const draftSnippetRows = draft.condition.trim()
    ? [{ condition: draft.condition.trim(), value: draft.value }]
    : [];
  const snippetRows = rows.length > 0 ? rows : draftSnippetRows;
  const caveatsLiteral = JSON.stringify(snippetRows, null, 2);

  const status = rows.length > 0 ? "pass" : "idle";
  const statusLabel =
    rows.length > 0 ? `${rows.length} caveat${rows.length > 1 ? "s" : ""}` : "idle";

  return (
    <Cell
      header={
        <HeaderRow
          title="Caveats"
          subtitle="Build and inspect a caveat list"
          trailing={
            <>
              <StatusPill state={status}>{statusLabel}</StatusPill>
              <CopyUrlButton />
            </>
          }
        />
      }
      body={
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Existing rows */}
          {rows.length > 0 ? (
            <div
              data-testid="caveats-list"
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              {rows.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
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

          {/* Add row form */}
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <label
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-dim)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
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

            <label
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-dim)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
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

            <button
              type="button"
              onClick={addRow}
              data-testid="caveat-add"
              style={{
                padding: "6px 12px",
                background: "var(--color-primary)",
                color: "var(--color-surface)",
                border: "none",
                borderRadius: 4,
                fontSize: "var(--size-13)",
                fontWeight: 500,
                cursor: "pointer",
                marginBottom: 0,
              }}
            >
              Add
            </button>
            <button
              type="button"
              onClick={reset}
              data-testid="caveats-reset"
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

          {draftError ? (
            <div
              data-testid="caveats-error"
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-danger)",
              }}
            >
              {draftError}
            </div>
          ) : null}

          {serialized.length > 0 ? (
            <div
              data-testid="caveats-output"
              style={{
                ...panelOutputStyle(),
                fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                fontSize: "var(--size-12-5)",
                color: "var(--color-dim)",
              }}
            >
              <div
                style={{
                  fontSize: "var(--size-11)",
                  textTransform: "uppercase",
                  letterSpacing: 0,
                  marginBottom: 6,
                }}
              >
                Serialized caveats
              </div>
              {serialized.map((s, i) => (
                <div key={i} style={{ color: "var(--color-text)" }}>
                  {s}
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
          template={`import { serializeCaveat, type Caveat } from "@boltwall/l402";\n\nconst caveats = {{caveatsLiteral}} satisfies Caveat[];\nconst serialized = caveats.map((caveat) => serializeCaveat(caveat));`}
          values={{
            caveatsLiteral,
          }}
        />
      }
    />
  );
}

import type { CSSProperties } from "react";

export type SegmentKind = "identifier" | "location" | "caveat" | "signature";

const KIND_COLOR: Record<SegmentKind, string> = {
  identifier: "var(--color-primary)",
  location: "var(--color-dim)",
  caveat: "var(--color-accent)",
  signature: "var(--color-warn)",
};

function hexRow(bytes: Uint8Array, bytesPerRow = 16): string[] {
  const rows: string[] = [];
  for (let i = 0; i < bytes.length; i += bytesPerRow) {
    rows.push(
      Array.from(bytes.slice(i, i + bytesPerRow))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" "),
    );
  }
  return rows;
}

export function SegmentDetail({
  kind,
  label,
  value,
  raw,
}: {
  kind: SegmentKind;
  label: string;
  value?: string;
  raw: Uint8Array;
}) {
  const color = KIND_COLOR[kind];
  const monoStyle: CSSProperties = {
    fontFamily:
      "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
    fontSize: "var(--size-12)",
  };

  return (
    <div
      data-testid="segment-detail"
      style={{
        marginTop: 8,
        padding: "12px 14px",
        background: "var(--color-surface-alt)",
        border: `1px solid ${color}`,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: "var(--size-11)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: "var(--size-11)", color: "var(--color-dim)" }}>
          {raw.length} bytes
        </span>
      </div>
      {value ? (
        <div style={{ marginBottom: 8, fontSize: "var(--size-13)", color: "var(--color-text)" }}>
          {value}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {hexRow(raw).map((row, i) => (
          <span
            key={i}
            style={{ ...monoStyle, color: "var(--color-dim)", whiteSpace: "pre" }}
          >
            {row}
          </span>
        ))}
      </div>
    </div>
  );
}

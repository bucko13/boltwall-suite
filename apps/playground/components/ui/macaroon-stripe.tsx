"use client";

import { useState } from "react";

import { SegmentDetail, type SegmentKind } from "./segment-detail";

export type MacaroonSegments = {
  identifier: Uint8Array;
  location: string;
  caveats: Array<{ raw: Uint8Array; condition: string; value: string }>;
  signature: Uint8Array;
};

export type MacaroonStripeProps = {
  segments: MacaroonSegments;
  selectedSegment?: SegmentKind;
  onSelectSegment?: (seg: SegmentKind, index?: number) => void;
  onTamper?: (seg: SegmentKind, index?: number) => void;
};

const SEG_COLORS: Record<SegmentKind, string> = {
  identifier: "var(--color-primary)",
  location: "var(--color-dim)",
  caveat: "var(--color-accent)",
  signature: "var(--color-warn)",
};

type SegSlot =
  | { kind: "identifier" | "location" | "signature"; index?: undefined }
  | { kind: "caveat"; index: number };

export function MacaroonStripe({
  segments,
  selectedSegment,
  onSelectSegment,
  onTamper,
}: MacaroonStripeProps) {
  const [internalSel, setInternalSel] = useState<{ kind: SegmentKind; index?: number } | null>(
    null,
  );
  const active = selectedSegment !== undefined ? { kind: selectedSegment } : internalSel;

  function select(slot: SegSlot) {
    const next = { kind: slot.kind, index: slot.index };
    if (onSelectSegment) {
      onSelectSegment(slot.kind, slot.index);
    } else {
      const update =
        active?.kind === slot.kind && active?.index === slot.index
          ? null
          : slot.index !== undefined
            ? { kind: slot.kind, index: slot.index }
            : { kind: slot.kind };
      setInternalSel(update);
    }
  }

  const locationBytes = new TextEncoder().encode(segments.location);

  const slots: Array<{ slot: SegSlot; label: string; bytes: number }> = [
    { slot: { kind: "identifier" }, label: "identifier", bytes: segments.identifier.length },
    { slot: { kind: "location" }, label: "location", bytes: locationBytes.length },
    ...segments.caveats.map((c, i) => ({
      slot: { kind: "caveat" as const, index: i },
      label: `caveat ${i + 1}`,
      bytes: c.raw.length,
    })),
    { slot: { kind: "signature" }, label: "signature", bytes: segments.signature.length },
  ];

  const totalBytes = slots.reduce((s, sl) => s + sl.bytes, 0);

  return (
    <div data-testid="macaroon-stripe">
      {/* Stripe bar */}
      <div
        style={{
          display: "flex",
          height: 36,
          borderRadius: 4,
          overflow: "hidden",
          border: "1px solid var(--color-border)",
        }}
      >
        {slots.map(({ slot, label, bytes }, i) => {
          const isActive = active?.kind === slot.kind && active?.index === slot.index;
          const color = SEG_COLORS[slot.kind];
          const pct = (bytes / totalBytes) * 100;
          return (
            <button
              key={`${slot.kind}-${slot.index ?? 0}`}
              type="button"
              onClick={() => select(slot)}
              data-testid={`stripe-seg-${slot.kind}${slot.index !== undefined ? `-${slot.index}` : ""}`}
              title={`${label}: ${bytes} bytes`}
              aria-pressed={isActive}
              style={{
                flex: `0 0 ${pct}%`,
                minWidth: 24,
                background: isActive
                  ? color
                  : `color-mix(in srgb, ${color} 30%, var(--color-surface-alt))`,
                borderRight: i < slots.length - 1 ? "1px solid var(--color-surface)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--size-10)",
                fontWeight: 600,
                color: isActive ? "var(--color-page)" : "var(--color-text)",
                overflow: "hidden",
                whiteSpace: "nowrap",
                transition: "background 120ms",
              }}
            >
              <span
                data-testid={`stripe-bytes-${slot.kind}${slot.index !== undefined ? `-${slot.index}` : ""}`}
              >
                {bytes}B
              </span>
            </button>
          );
        })}
      </div>

      {/* Segment labels below stripe */}
      <div style={{ display: "flex", marginTop: 4 }}>
        {slots.map(({ slot, label, bytes }) => {
          const pct = (bytes / totalBytes) * 100;
          const color = SEG_COLORS[slot.kind];
          return (
            <div
              key={`${slot.kind}-lbl-${slot.index ?? 0}`}
              style={{
                flex: `0 0 ${pct}%`,
                minWidth: 0,
                overflow: "hidden",
                fontSize: "var(--size-10)",
                color,
                fontWeight: 500,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      {/* Active segment detail */}
      {active
        ? (() => {
            if (active.kind === "identifier") {
              return (
                <SegmentDetail kind="identifier" label="identifier" raw={segments.identifier} />
              );
            }
            if (active.kind === "location") {
              return (
                <SegmentDetail
                  kind="location"
                  label="location"
                  value={segments.location}
                  raw={locationBytes}
                />
              );
            }
            if (active.kind === "caveat" && active.index !== undefined) {
              const c = segments.caveats[active.index];
              return c ? (
                <div>
                  <SegmentDetail
                    kind="caveat"
                    label={`caveat ${active.index + 1}`}
                    value={`${c.condition} = ${c.value}`}
                    raw={c.raw}
                  />
                  {onTamper ? (
                    <button
                      type="button"
                      onClick={() => onTamper("caveat", active.index)}
                      style={{
                        marginTop: 6,
                        padding: "4px 10px",
                        fontSize: "var(--size-12)",
                        fontWeight: 500,
                        background: "var(--color-danger-soft)",
                        color: "var(--color-danger)",
                        border: "1px solid var(--color-danger)",
                        borderRadius: 4,
                      }}
                    >
                      Tamper
                    </button>
                  ) : null}
                </div>
              ) : null;
            }
            if (active.kind === "signature") {
              return <SegmentDetail kind="signature" label="signature" raw={segments.signature} />;
            }
            return null;
          })()
        : null}
    </div>
  );
}

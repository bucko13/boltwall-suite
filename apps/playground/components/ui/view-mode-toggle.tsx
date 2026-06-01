"use client";

import { useState } from "react";

export type ViewMode = "raw" | "json" | "code";

const ALL_MODES: ViewMode[] = ["raw", "json", "code"];

export function ViewModeToggle({
  value,
  onChange,
  modes = ALL_MODES,
  labels,
}: {
  value?: ViewMode;
  onChange?: (mode: ViewMode) => void;
  modes?: ViewMode[];
  // Optional per-mode display overrides. The mode key stays the stable
  // internal value; only the rendered tab text changes (e.g. "stripe" → "Decode Map").
  labels?: Record<string, string>;
}) {
  const [internal, setInternal] = useState<ViewMode>(value ?? modes[0] ?? "raw");
  const active = value ?? internal;

  function pick(m: ViewMode) {
    if (value === undefined) setInternal(m);
    onChange?.(m);
  }

  return (
    <div
      data-testid="view-mode-toggle"
      role="tablist"
      aria-label="View mode"
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {modes.map((m, i) => {
        const isActive = m === active;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => pick(m)}
            style={{
              padding: "3px 10px",
              fontSize: "var(--size-12)",
              fontWeight: 500,
              color: isActive ? "var(--color-text)" : "var(--color-dim)",
              background: isActive ? "var(--color-surface-alt)" : "var(--color-surface)",
              borderRight: i < modes.length - 1 ? "1px solid var(--color-border)" : "none",
            }}
          >
            {labels?.[m] ?? m}
          </button>
        );
      })}
    </div>
  );
}

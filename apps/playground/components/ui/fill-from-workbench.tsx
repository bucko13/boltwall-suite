"use client";

/**
 * Props for {@link FillFromWorkbench}.
 */
export interface FillFromWorkbenchProps {
  /**
   * The noun this button fills, used in the label and tooltip — e.g.
   * `"macaroon"`, `"credential"`, `"challenge"`, `"key"`.
   */
  label: string;
  /** The value currently held in Workbench memory (what would be filled in). */
  available: string;
  /** The panel input's current value, used to detect an already-filled no-op. */
  current: string;
  /** Called with the trimmed workbench value when the user fills. */
  onFill: (value: string) => void;
  /** Test id for the button. */
  testId?: string;
}

function workbenchButtonStyle(enabled: boolean) {
  return {
    padding: "4px 8px",
    background: enabled ? "var(--color-surface)" : "var(--color-surface-alt)",
    color: enabled ? "var(--color-text)" : "var(--color-dim)",
    border: "1px solid var(--color-border)",
    borderRadius: 4,
    fontSize: "var(--size-11)",
    fontWeight: 500,
    cursor: enabled ? "pointer" : "not-allowed",
  } as const;
}

/**
 * Explicit "fill this input from Workbench memory" button. Panel inputs are plain
 * local state and never auto-sync to the Workbench; this button is the only way a
 * carried value enters a panel input. It is disabled when nothing is available
 * OR when the input already holds that exact value (a no-op), with a tooltip that
 * explains which case applies.
 *
 * @example
 * <FillFromWorkbench
 *   label="credential"
 *   available={workbench.credential}
 *   current={token}
 *   onFill={setToken}
 *   testId="validate-fill-credential"
 * />
 */
export function FillFromWorkbench({
  label,
  available,
  current,
  onFill,
  testId,
}: FillFromWorkbenchProps) {
  const value = available.trim();
  const hasValue = value !== "";
  const alreadyFilled = hasValue && current.trim() === value;
  const enabled = hasValue && !alreadyFilled;

  const title = !hasValue
    ? `No ${label} in workbench`
    : alreadyFilled
      ? `${label} already filled`
      : `Fill ${label} from workbench`;

  return (
    <button
      type="button"
      onClick={() => onFill(value)}
      disabled={!enabled}
      title={title}
      aria-label={title}
      data-testid={testId}
      style={workbenchButtonStyle(enabled)}
    >
      Fill {label} from workbench
    </button>
  );
}

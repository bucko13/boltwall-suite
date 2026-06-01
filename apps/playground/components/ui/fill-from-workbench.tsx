"use client";

/**
 * Props for {@link FillFromWorkbench}.
 */
export interface FillFromWorkbenchProps {
  /**
   * The noun this button fills, used in the short label and tooltip — e.g.
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

/**
 * The derived display and interaction state of a fill-from-Workbench control.
 * Returned by {@link deriveFillState}.
 */
export interface FillState {
  /** Trimmed Workbench value that would be filled in (passed to `onFill`). */
  value: string;
  /** Whether the Workbench holds a non-empty value to fill. */
  hasValue: boolean;
  /** Whether the input already equals the available value (filling is a no-op). */
  alreadyFilled: boolean;
  /** Whether the fill action is available: `hasValue` and not `alreadyFilled`. */
  enabled: boolean;
  /** Capitalized noun used for the button label, e.g. `"Credential"`. */
  display: string;
  /** Tooltip / aria-label text explaining the current state. */
  title: string;
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
    minWidth: 68,
    textAlign: "center",
  } as const;
}

function displayLabel(label: string) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Pure derivation of a fill-from-Workbench control's state from its three
 * inputs. Extracted from {@link FillFromWorkbench} so the enable/disable and
 * tooltip logic can be unit-tested without rendering. Both the available and
 * current values are compared after trimming, matching the component: the
 * control is disabled when nothing is available OR when the input already holds
 * that exact value, and the tooltip explains which case applies.
 *
 * @param label - The noun being filled (`"macaroon"`, `"credential"`, …).
 * @param available - The value held in Workbench memory.
 * @param current - The panel input's current value.
 * @returns The trimmed fill value plus derived flags, display label, and title.
 *
 * @example
 * deriveFillState("credential", "L402 mac:preimage", "").enabled; // true
 * deriveFillState("macaroon", "", "anything").title; // "No macaroon in Workbench"
 * deriveFillState("challenge", "v", "v").alreadyFilled; // true
 */
export function deriveFillState(label: string, available: string, current: string): FillState {
  const value = available.trim();
  const hasValue = value !== "";
  const alreadyFilled = hasValue && current.trim() === value;
  const enabled = hasValue && !alreadyFilled;
  const display = displayLabel(label);

  const title = !hasValue
    ? `No ${label} in Workbench`
    : alreadyFilled
      ? `${display} already filled`
      : `Use ${label} from Workbench`;

  return { value, hasValue, alreadyFilled, enabled, display, title };
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
  const { value, enabled, title, display } = deriveFillState(label, available, current);

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
      {display}
    </button>
  );
}

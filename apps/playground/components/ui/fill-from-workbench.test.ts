import { describe, expect, it } from "bun:test";

import { deriveFillState } from "./fill-from-workbench";

describe("deriveFillState", () => {
  it("is enabled when the Workbench holds a value the input lacks", () => {
    const state = deriveFillState("credential", "L402 mac:preimage", "");
    expect(state.enabled).toBe(true);
    expect(state.hasValue).toBe(true);
    expect(state.alreadyFilled).toBe(false);
    expect(state.value).toBe("L402 mac:preimage");
    expect(state.display).toBe("Credential");
    expect(state.title).toBe("Use credential from Workbench");
  });

  it("is disabled with a 'no value' tooltip when the Workbench is empty", () => {
    const state = deriveFillState("macaroon", "", "anything");
    expect(state.enabled).toBe(false);
    expect(state.hasValue).toBe(false);
    expect(state.alreadyFilled).toBe(false);
    expect(state.title).toBe("No macaroon in Workbench");
  });

  it("treats a whitespace-only Workbench value as empty", () => {
    const state = deriveFillState("macaroon", "   ", "");
    expect(state.hasValue).toBe(false);
    expect(state.enabled).toBe(false);
    expect(state.value).toBe("");
    expect(state.title).toBe("No macaroon in Workbench");
  });

  it("is disabled with an 'already filled' tooltip when the input matches", () => {
    const state = deriveFillState("macaroon", "AGIA...", "AGIA...");
    expect(state.alreadyFilled).toBe(true);
    expect(state.enabled).toBe(false);
    // Tooltip capitalizes the noun for the already-filled case.
    expect(state.title).toBe("Macaroon already filled");
  });

  it("compares available and current after trimming", () => {
    const state = deriveFillState("challenge", "  value  ", "value");
    expect(state.value).toBe("value");
    expect(state.alreadyFilled).toBe(true);
    expect(state.enabled).toBe(false);
  });

  it("re-enables once the input diverges from the Workbench value", () => {
    const state = deriveFillState("challenge", "value-a", "value-b");
    expect(state.alreadyFilled).toBe(false);
    expect(state.enabled).toBe(true);
    expect(state.title).toBe("Use challenge from Workbench");
  });

  it("capitalizes the noun for the button display label", () => {
    expect(deriveFillState("key", "k", "").display).toBe("Key");
    expect(deriveFillState("macaroon", "m", "").display).toBe("Macaroon");
  });
});

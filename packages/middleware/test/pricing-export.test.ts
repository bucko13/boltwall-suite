import { describe, expect, test } from "bun:test";

import * as expressExports from "../src/express/index";

describe("express pricing re-export", () => {
  test("does not expose private workspace pricing helpers", () => {
    expect("sats" in expressExports).toBe(false);
    expect("msats" in expressExports).toBe(false);
    expect("btc" in expressExports).toBe(false);
  });
});

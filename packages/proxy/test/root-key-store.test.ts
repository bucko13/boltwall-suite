import { describe, expect, test } from "bun:test";

import { MockAdapter } from "@boltwall/adapters/testing";
import { InMemoryRootKeyStore } from "@boltwall/l402";

import {
  BoltwallConfigError,
  parseBoltwallConfig,
  toProxyConfig,
} from "../src/config-schema";
import { DerivedRootKeyStore, PROXY_ROOT_KEY_ENV } from "../src/root-key-store";

const SECRET_HEX = "ab".repeat(32);
const OTHER_SECRET_HEX = "cd".repeat(32);

describe("DerivedRootKeyStore", () => {
  test("derives a 32-byte key deterministically per token id", async () => {
    const store = new DerivedRootKeyStore(SECRET_HEX);
    const tokenId = new Uint8Array(32).fill(7);

    const first = await store.get(tokenId);
    const second = await store.get(tokenId);

    expect(first).not.toBeNull();
    expect(first).toHaveLength(32);
    expect(first).toEqual(second);
  });

  test("derives distinct keys for distinct token ids", async () => {
    const store = new DerivedRootKeyStore(SECRET_HEX);

    const a = await store.get(new Uint8Array(32).fill(1));
    const b = await store.get(new Uint8Array(32).fill(2));

    expect(a).not.toEqual(b);
  });

  test("derives distinct keys under distinct secrets", async () => {
    const tokenId = new Uint8Array(32).fill(7);

    const a = await new DerivedRootKeyStore(SECRET_HEX).get(tokenId);
    const b = await new DerivedRootKeyStore(OTHER_SECRET_HEX).get(tokenId);

    expect(a).not.toEqual(b);
  });

  test("instances sharing a secret derive the same keys (multi-instance)", async () => {
    const tokenId = new Uint8Array(32).fill(9);

    const minted = await new DerivedRootKeyStore(SECRET_HEX).get(tokenId);
    const verified = await new DerivedRootKeyStore(SECRET_HEX).get(tokenId);

    expect(minted).toEqual(verified);
  });

  test("accepts uppercase hex and surrounding whitespace", async () => {
    const tokenId = new Uint8Array(32).fill(3);

    const canonical = await new DerivedRootKeyStore(SECRET_HEX).get(tokenId);
    const upper = await new DerivedRootKeyStore(SECRET_HEX.toUpperCase()).get(tokenId);
    const padded = await new DerivedRootKeyStore(`  ${SECRET_HEX}\n`).get(tokenId);

    expect(upper).toEqual(canonical);
    expect(padded).toEqual(canonical);
  });

  test.each([
    ["empty", ""],
    ["too short", "ab".repeat(31)],
    ["too long", "ab".repeat(33)],
    ["non-hex", "zz".repeat(32)],
    ["base64-looking", `${"ab".repeat(31)}+/`],
  ])("rejects a malformed secret (%s) without echoing it", (_label, secret) => {
    let thrown: unknown;
    try {
      new DerivedRootKeyStore(secret);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RangeError);
    const message = (thrown as RangeError).message;
    if (secret.length > 0) {
      expect(message).not.toContain(secret);
    }
    expect(message).toContain("hex");
  });

  test("put is a no-op: get still returns the derived key afterwards", async () => {
    const store = new DerivedRootKeyStore(SECRET_HEX);
    const tokenId = new Uint8Array(32).fill(5);
    const derived = await store.get(tokenId);

    await store.put(tokenId, new Uint8Array(32).fill(0xff));

    expect(await store.get(tokenId)).toEqual(derived);
  });

  test("delete is a no-op: derivation has no per-token state to revoke", async () => {
    const store = new DerivedRootKeyStore(SECRET_HEX);
    const tokenId = new Uint8Array(32).fill(5);
    const derived = await store.get(tokenId);

    await store.delete(tokenId);

    expect(await store.get(tokenId)).toEqual(derived);
  });
});

describe("toProxyConfig root-key store selection", () => {
  const config = parseBoltwallConfig({
    targetUrl: "https://api.example.com",
    backend: { kind: "opennode" },
    pricing: { defaultPriceMsat: "1000" },
  });
  const backend = new MockAdapter();

  test(`selects DerivedRootKeyStore when ${PROXY_ROOT_KEY_ENV} is set`, () => {
    const proxyConfig = toProxyConfig(config, backend, { [PROXY_ROOT_KEY_ENV]: SECRET_HEX });
    expect(proxyConfig.rootKeyStore).toBeInstanceOf(DerivedRootKeyStore);
  });

  test(`selects InMemoryRootKeyStore when ${PROXY_ROOT_KEY_ENV} is absent`, () => {
    const proxyConfig = toProxyConfig(config, backend, {});
    expect(proxyConfig.rootKeyStore).toBeInstanceOf(InMemoryRootKeyStore);
  });

  test("treats a blank value as absent", () => {
    const proxyConfig = toProxyConfig(config, backend, { [PROXY_ROOT_KEY_ENV]: "   " });
    expect(proxyConfig.rootKeyStore).toBeInstanceOf(InMemoryRootKeyStore);
  });

  test("fails fast on a malformed secret, naming the variable but not the value", () => {
    let thrown: unknown;
    try {
      toProxyConfig(config, backend, { [PROXY_ROOT_KEY_ENV]: "not-a-key" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BoltwallConfigError);
    const message = (thrown as BoltwallConfigError).message;
    expect(message).toContain(PROXY_ROOT_KEY_ENV);
    expect(message).not.toContain("not-a-key");
  });
});

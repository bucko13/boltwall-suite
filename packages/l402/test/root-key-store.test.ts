import { describe, expect, test } from "bun:test";

import { InMemoryRootKeyStore, type RootKeyStore } from "../src/root-key-store";

const tokenId = new Uint8Array([0x00, 0x01, 0xfe, 0xff]);
const otherTokenId = new Uint8Array([0xff, 0xfe, 0x01, 0x00]);
const rootKey = new Uint8Array([0x10, 0x20, 0x30, 0x40]);
const replacementRootKey = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);

describe("InMemoryRootKeyStore", () => {
  test("implements the RootKeyStore contract", () => {
    const store: RootKeyStore = new InMemoryRootKeyStore();
    expect(store).toBeInstanceOf(InMemoryRootKeyStore);
  });

  test("put then get round-trips a root key", async () => {
    const store = new InMemoryRootKeyStore();

    await store.put(tokenId, rootKey);

    expect(await store.get(tokenId)).toEqual(rootKey);
  });

  test("get of an unknown token id returns null", async () => {
    const store = new InMemoryRootKeyStore();

    expect(await store.get(tokenId)).toBeNull();
  });

  test("put overwrites an existing root key for the token id", async () => {
    const store = new InMemoryRootKeyStore();

    await store.put(tokenId, rootKey);
    await store.put(tokenId, replacementRootKey);

    expect(await store.get(tokenId)).toEqual(replacementRootKey);
  });

  test("delete removes the root key and is idempotent", async () => {
    const store = new InMemoryRootKeyStore();

    await store.put(tokenId, rootKey);
    await store.delete(tokenId);
    await store.delete(tokenId);

    expect(await store.get(tokenId)).toBeNull();
  });

  test("multiple stores are independent", async () => {
    const first = new InMemoryRootKeyStore();
    const second = new InMemoryRootKeyStore();

    await first.put(tokenId, rootKey);

    expect(await first.get(tokenId)).toEqual(rootKey);
    expect(await second.get(tokenId)).toBeNull();
  });

  test("token ids use byte equality rather than Uint8Array identity", async () => {
    const store = new InMemoryRootKeyStore();
    const sameTokenId = new Uint8Array(tokenId);

    await store.put(tokenId, rootKey);

    expect(await store.get(sameTokenId)).toEqual(rootKey);
  });

  test("stored root keys are not mutated by caller-owned input arrays", async () => {
    const store = new InMemoryRootKeyStore();
    const mutableRootKey = new Uint8Array(rootKey);

    await store.put(tokenId, mutableRootKey);
    mutableRootKey.fill(0x00);

    expect(await store.get(tokenId)).toEqual(rootKey);
  });

  test("returned root keys are copies", async () => {
    const store = new InMemoryRootKeyStore();

    await store.put(tokenId, rootKey);
    const got = await store.get(tokenId);
    expect(got).not.toBeNull();
    got?.fill(0x00);

    expect(await store.get(tokenId)).toEqual(rootKey);
  });

  test("concurrent put/get operations keep token ids isolated", async () => {
    const store = new InMemoryRootKeyStore();

    await Promise.all([
      store.put(tokenId, rootKey),
      store.put(otherTokenId, replacementRootKey),
    ]);

    const [first, second] = await Promise.all([
      store.get(tokenId),
      store.get(otherTokenId),
    ]);

    expect(first).toEqual(rootKey);
    expect(second).toEqual(replacementRootKey);
  });
});

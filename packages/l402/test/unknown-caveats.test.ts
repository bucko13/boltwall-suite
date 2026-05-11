// L402 macaroon-spec.md §Verification / Step 3: if no satisfier is
// registered for a caveat condition, the caveat MUST be skipped. Do not change
// this default to true. The spec requires skip; the security model handles
// unknown caveats by declaring required known caveats explicitly.

import { unknownCaveatVerificationFixture } from "@boltwall/test-fixtures";
import { describe, expect, test } from "bun:test";

import { InMemoryRootKeyStore, mintMacaroon, validUntilSatisfier, verifyMacaroon } from "../src";

describe("verifyMacaroon unknown caveat handling", () => {
  test("skips unknown caveats by default while evaluating known satisfiers", async () => {
    const fixture = await createUnknownCaveatFixture();

    await expect(
      verifyMacaroon({
        macaroons: [fixture.macaroon],
        preimage: fixture.preimage,
        rootKeyStore: fixture.rootKeyStore,
        satisfiers: [validUntilSatisfier()],
        context: { now: new Date("2026-01-01T00:00:00Z") },
      }),
    ).resolves.toEqual({ ok: true });
  });

  test("rejects unknown caveats only when strictUnknownCaveats is true", async () => {
    const fixture = await createUnknownCaveatFixture();

    await expect(
      verifyMacaroon({
        macaroons: [fixture.macaroon],
        preimage: fixture.preimage,
        rootKeyStore: fixture.rootKeyStore,
        satisfiers: [validUntilSatisfier()],
        context: { now: new Date("2026-01-01T00:00:00Z") },
        strictUnknownCaveats: true,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "unknown-caveat:experimental-future-feature",
    });
  });
});

async function createUnknownCaveatFixture(): Promise<{
  macaroon: string;
  preimage: Uint8Array;
  rootKeyStore: InMemoryRootKeyStore;
}> {
  const fixture = unknownCaveatVerificationFixture;
  const rootKey = hexToBytes(fixture.rootKeyHex);
  const tokenId = hexToBytes(fixture.tokenIdHex);
  const paymentHash = hexToBytes(fixture.paymentHashHex);
  const preimage = hexToBytes(fixture.preimageHex);
  const rootKeyStore = new InMemoryRootKeyStore();
  await rootKeyStore.put(tokenId, rootKey);

  return {
    macaroon: mintMacaroon({
      rootKey,
      identifier: {
        version: 0,
        paymentHash,
        tokenId,
      },
      caveats: [fixture.knownCaveat, fixture.unknownCaveat],
    }),
    preimage,
    rootKeyStore,
  };
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

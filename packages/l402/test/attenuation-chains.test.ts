import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, test } from "bun:test";

import { attenuationChainFixtures } from "@boltwall/test-fixtures";

import {
  InMemoryRootKeyStore,
  capabilitiesSatisfier,
  mintMacaroon,
  servicesSatisfier,
  validUntilSatisfier,
  verifyMacaroon,
  type Caveat,
  type CaveatSatisfier,
} from "../src";

// L402 macaroon-spec.md §Caveat Format, §Attenuation (Delegation), and
// §Verification require repeated caveats with the same condition to narrow
// authority via SatisfyPrevious before the verifier evaluates SatisfyFinal.
describe("verifyMacaroon attenuation chains", () => {
  for (const fixture of attenuationChainFixtures.filter((entry) =>
    ["services", "pokedex_capabilities", "valid-until"].includes(entry.condition),
  )) {
    test(`${fixture.name} verifier chain`, async () => {
      const issued = await issueMacaroon([
        { condition: fixture.condition, value: fixture.previous },
        { condition: fixture.condition, value: fixture.next },
      ]);

      await expect(
        verifyMacaroon({
          macaroons: [issued.macaroon],
          preimage: issued.preimage,
          rootKeyStore: issued.rootKeyStore,
          satisfiers: [satisfierFor(fixture.condition)],
          context: { now: new Date("2026-01-01T00:00:00.000Z") },
        }),
      ).resolves.toEqual(
        fixture.expected
          ? { ok: true }
          : { ok: false, reason: `caveat-rejected:${fixture.condition}` },
      );
    });
  }

  test("evaluates mixed attenuation chains independently", async () => {
    const issued = await issueMacaroon([
      { condition: "services", value: "pokedex:0,proxy:0" },
      { condition: "services", value: "pokedex:0" },
      { condition: "valid-until", value: "2030-01-01T00:00:00.000Z" },
    ]);

    await expect(
      verifyMacaroon({
        macaroons: [issued.macaroon],
        preimage: issued.preimage,
        rootKeyStore: issued.rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex"), validUntilSatisfier()],
        context: { now: new Date("2026-01-01T00:00:00.000Z") },
      }),
    ).resolves.toEqual({ ok: true });
  });
});

async function issueMacaroon(caveats: Caveat[]): Promise<{
  macaroon: string;
  preimage: Uint8Array;
  rootKeyStore: InMemoryRootKeyStore;
}> {
  const rootKey = hexToBytes(
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  );
  const tokenId = repeatedBytes(0x42);
  const preimage = repeatedBytes(0x11);
  const rootKeyStore = new InMemoryRootKeyStore();
  await rootKeyStore.put(tokenId, rootKey);

  return {
    macaroon: mintMacaroon({
      rootKey,
      identifier: {
        version: 0,
        paymentHash: sha256(preimage),
        tokenId,
      },
      caveats,
    }),
    preimage,
    rootKeyStore,
  };
}

function satisfierFor(condition: string): CaveatSatisfier {
  if (condition === "services") {
    return servicesSatisfier("pokedex");
  }
  if (condition === "pokedex_capabilities") {
    return capabilitiesSatisfier("pokedex", "read");
  }
  if (condition === "valid-until") {
    return validUntilSatisfier();
  }
  throw new Error(`missing test satisfier for ${condition}`);
}

function repeatedBytes(byte: number): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

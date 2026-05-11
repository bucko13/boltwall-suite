import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, test } from "bun:test";

import {
  InMemoryRootKeyStore,
  buildAuthorizationHeader,
  capabilitiesSatisfier,
  decodeIdentifier,
  mintMacaroon,
  parseAuthenticateHeader,
  servicesSatisfier,
  verifyMacaroon,
  type CaveatSatisfier,
} from "../../src";

const smokeTest = process.env.APERTURE_SMOKE === "1" ? test : test.skip;
const PAYMENT_PREIMAGE_LENGTH = 32;

describe("Aperture manual smoke", () => {
  smokeTest("verifies an Aperture-minted macaroon with Boltwall", async () => {
    const macaroon = requiredEnv("APERTURE_SMOKE_MACAROON_B64");
    const rootKey = hexToBytes(requiredEnv("APERTURE_SMOKE_ROOT_KEY_HEX"));
    const preimage = hexToBytes(requiredEnv("APERTURE_SMOKE_PREIMAGE_HEX"));
    const identifier = decodeIdentifier(macaroon);
    const rootKeyStore = new InMemoryRootKeyStore();
    await rootKeyStore.put(identifier.tokenId, rootKey);

    await expect(
      verifyMacaroon({
        macaroons: [macaroon],
        preimage,
        rootKeyStore,
        satisfiers: apertureSatisfiers(),
        context: {
          request: new Request(process.env.APERTURE_SMOKE_URL ?? "http://localhost:8081/pokemon/1"),
          now: new Date(),
        },
      }),
    ).resolves.toEqual({ ok: true });
  });

  smokeTest("can present a Boltwall-minted credential to Aperture", async () => {
    const apertureUrl = requiredEnv("APERTURE_SMOKE_URL");
    const preimage = hexToBytes(requiredEnv("APERTURE_SMOKE_PREIMAGE_HEX"));
    assertLength(preimage, PAYMENT_PREIMAGE_LENGTH, "APERTURE_SMOKE_PREIMAGE_HEX");
    const rootKey = envHex("APERTURE_SMOKE_BOLTWALL_ROOT_KEY_HEX") ?? repeatedBytes(0xa4);
    const tokenId = envHex("APERTURE_SMOKE_BOLTWALL_TOKEN_ID_HEX") ?? repeatedBytes(0xb7);
    const macaroon = mintMacaroon({
      rootKey,
      identifier: {
        version: 0,
        paymentHash: sha256(preimage),
        tokenId,
      },
      caveats: [{ condition: "services", value: `${apertureService()}:0` }],
    });
    const authorization = buildAuthorizationHeader({
      macaroons: macaroon,
      preimage: bytesToHex(preimage),
    });

    if (process.env.APERTURE_SMOKE_EXPECT_APERTURE_ACCEPTS_BOLTWALL !== "1") {
      throw new Error(
        [
          "preload Aperture with this Boltwall test root key before enabling the reverse smoke:",
          `APERTURE_SMOKE_BOLTWALL_TOKEN_ID_HEX=${bytesToHex(tokenId)}`,
          `APERTURE_SMOKE_BOLTWALL_ROOT_KEY_HEX=${bytesToHex(rootKey)}`,
          "then rerun with APERTURE_SMOKE_EXPECT_APERTURE_ACCEPTS_BOLTWALL=1",
        ].join("\n"),
      );
    }

    const response = await fetch(apertureUrl, {
      headers: {
        Authorization: authorization,
      },
    });
    if (response.status === 402) {
      const challenge = response.headers.get("WWW-Authenticate");
      if (challenge !== null) {
        expect(parseAuthenticateHeader(challenge).length).toBeGreaterThan(0);
      }
    }
    expect(response.status).toBe(200);
  });
});

function apertureSatisfiers(): CaveatSatisfier[] {
  const service = apertureService();
  const satisfiers: CaveatSatisfier[] = [servicesSatisfier(service)];
  const capability = process.env.APERTURE_SMOKE_CAPABILITY;
  if (capability !== undefined && capability.length > 0) {
    satisfiers.push(capabilitiesSatisfier(service, capability));
  }
  return satisfiers;
}

function apertureService(): string {
  return process.env.APERTURE_SMOKE_SERVICE ?? "pokedex";
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

function envHex(name: string): Uint8Array | null {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? null : hexToBytes(value);
}

function repeatedBytes(byte: number): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error("invalid-hex");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertLength(bytes: Uint8Array, expected: number, label: string): void {
  if (bytes.length !== expected) {
    throw new Error(`${label} must decode to ${String(expected)} bytes`);
  }
}

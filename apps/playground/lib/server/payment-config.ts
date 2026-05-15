/// <reference path="../../../../packages/l402/src/internal/macaroon-library.d.ts" />

import type { LightningBackend } from "@boltwall/adapters";
import { LndAdapter } from "@boltwall/adapters/lnd";
import type { Caveat, CaveatSatisfier } from "@boltwall/l402";
import type { L402Config } from "@boltwall/middleware";
import { z } from "zod";

export const POKEDEX_PRICE_MSAT = 1_000n;
export const MOCK_POKEAPI_MODE = "fixture";

const PaymentEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    BOLTWALL_PLAYGROUND_BACKEND: z
      .enum(["mock", "lnd", "voltage-lnd", "opennode", "btcpay"])
      .optional(),
    BOLTWALL_PLAYGROUND_POKEAPI_MODE: z.enum([MOCK_POKEAPI_MODE]).optional(),
    LND_SOCKET: z.string().min(1).optional(),
    LND_CERT_BASE64: z.string().min(1).optional(),
    LND_MACAROON_BASE64: z.string().min(1).optional(),
  })
  .passthrough();

export type PaymentEnv = z.infer<typeof PaymentEnvSchema>;
export type BackendSelection = NonNullable<PaymentEnv["BOLTWALL_PLAYGROUND_BACKEND"]>;
export type PokeApiMode = "live" | typeof MOCK_POKEAPI_MODE;

export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigError";
  }
}

export interface PokedexPaymentRuntime {
  config: L402Config;
  pokeApiMode: PokeApiMode;
  testPayments?: MockPaymentController;
}

export interface MockPaymentController {
  settleChallenge(challengeHeader: string): Promise<string>;
}

export interface ServerL402Runtime {
  InMemoryRootKeyStore: new () => L402Config["rootKeyStore"];
  validUntil: (args: { seconds: number }) => Caveat;
  validUntilSatisfier: () => CaveatSatisfier;
  buildAuthorizationHeader: (args: {
    macaroons: string | string[];
    preimage: string;
    scheme?: "L402" | "LSAT";
  }) => string;
  decodeIdentifier: (macaroon: string) => { paymentHash: Uint8Array };
  parseAuthenticateHeader: (header: string) => Array<{
    scheme: string;
    macaroon: string;
    invoice: string;
  }>;
}

export function parsePaymentEnv(env: NodeJS.ProcessEnv): PaymentEnv {
  const result = PaymentEnvSchema.safeParse(env);
  if (result.success) return result.data;

  const fields = result.error.issues
    .map((issue) => issue.path.join(".") || "env")
    .filter((field, index, all) => all.indexOf(field) === index)
    .join(", ");
  throw new PaymentConfigError(`Invalid playground payment configuration: ${fields}`);
}

export function selectPaymentBackend(env: PaymentEnv): BackendSelection {
  if (env.BOLTWALL_PLAYGROUND_BACKEND !== undefined) {
    return env.BOLTWALL_PLAYGROUND_BACKEND;
  }
  if (env.NODE_ENV === "production") {
    throw new PaymentConfigError(
      "Set BOLTWALL_PLAYGROUND_BACKEND=lnd or voltage-lnd for production paid endpoints.",
    );
  }
  return "mock";
}

export async function loadServerL402(): Promise<ServerL402Runtime> {
  // bw-xk0b tracks removing this once the built @boltwall/l402 ESM bundle
  // can be consumed directly by Next.js Node route handlers.
  return (await import("../../../../packages/l402/src/index")) as unknown as ServerL402Runtime;
}

export async function createProductionPokedexPaymentRuntime(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PokedexPaymentRuntime> {
  const parsed = parsePaymentEnv(env);
  const backendSelection = selectPaymentBackend(parsed);
  if (backendSelection === "mock") {
    throw new PaymentConfigError(
      "Mock payments are test-only; select lnd or voltage-lnd for this runtime.",
    );
  }

  return buildPokedexPaymentRuntime(
    parsed,
    createProductionLightningBackend(parsed, backendSelection),
  );
}

export async function buildPokedexPaymentRuntime(
  env: PaymentEnv,
  backend: LightningBackend,
  testPayments?: MockPaymentController,
): Promise<PokedexPaymentRuntime> {
  const { InMemoryRootKeyStore, validUntil, validUntilSatisfier } = await loadServerL402();
  return {
    config: {
      service: "pokedex",
      backend,
      rootKeyStore: new InMemoryRootKeyStore(),
      price: POKEDEX_PRICE_MSAT,
      caveats: [validUntil({ seconds: 3600 })],
      satisfiers: [validUntilSatisfier()],
      challengeCompatibility: "dual",
      invoiceMemo: (req: Request) => `Boltwall Pokedex ${new URL(req.url).pathname}`,
    },
    pokeApiMode: env.BOLTWALL_PLAYGROUND_POKEAPI_MODE ?? "live",
    ...(testPayments === undefined ? {} : { testPayments }),
  };
}

export function createProductionLightningBackend(
  env: PaymentEnv,
  backendSelection: Exclude<BackendSelection, "mock">,
): LightningBackend {
  if (backendSelection === "opennode" || backendSelection === "btcpay") {
    throw new PaymentConfigError(
      `${backendSelection} is not wired into the playground paid endpoint yet; select lnd or voltage-lnd.`,
    );
  }

  const missing = ["LND_SOCKET", "LND_CERT_BASE64", "LND_MACAROON_BASE64"].filter(
    (key) => env[key as keyof PaymentEnv] === undefined,
  );
  if (missing.length > 0) {
    throw new PaymentConfigError(
      `Missing ${missing.join(", ")} for ${backendSelection}; credential values were not logged.`,
    );
  }

  return new LndAdapter({
    socket: env.LND_SOCKET!,
    cert: env.LND_CERT_BASE64!,
    macaroon: env.LND_MACAROON_BASE64!,
  });
}

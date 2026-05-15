import {
  PaymentConfigError,
  createProductionPokedexPaymentRuntime,
  parsePaymentEnv,
  selectPaymentBackend,
} from "./payment-config";
import type { PokedexPaymentRuntime } from "./payment-config";

export { PaymentConfigError } from "./payment-config";

export const TEST_PAYMENT_ENABLED = "1";

let runtime: Promise<PokedexPaymentRuntime> | undefined;

export function getPokedexPaymentRuntime(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PokedexPaymentRuntime> {
  runtime ??= createPokedexPaymentRuntime(env);
  return runtime;
}

export async function createPokedexPaymentRuntime(
  env: NodeJS.ProcessEnv,
): Promise<PokedexPaymentRuntime> {
  const parsed = parsePaymentEnv(env);
  const backendSelection = selectPaymentBackend(parsed);

  if (backendSelection !== "mock") {
    return createProductionPokedexPaymentRuntime(env);
  }

  if (
    parsed.NODE_ENV === "production" ||
    env.BOLTWALL_PLAYGROUND_ENABLE_TEST_PAYMENT !== TEST_PAYMENT_ENABLED
  ) {
    throw new PaymentConfigError(
      "Mock payments are test-only; set BOLTWALL_PLAYGROUND_ENABLE_TEST_PAYMENT=1 outside production to enable them.",
    );
  }

  const { createTestPokedexPaymentRuntime } = await import("./test-payment-config");
  return createTestPokedexPaymentRuntime(env);
}

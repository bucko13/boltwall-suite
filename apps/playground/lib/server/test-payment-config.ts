import type { CreatedInvoice, CreateInvoiceRequest } from "@boltwall/adapters";
import { MockAdapter } from "@boltwall/adapters/testing";

import {
  PaymentConfigError,
  buildPokedexPaymentRuntime,
  loadServerL402,
  parsePaymentEnv,
} from "./payment-config";
import type { MockPaymentController, PokedexPaymentRuntime } from "./payment-config";

export function createTestPokedexPaymentRuntime(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PokedexPaymentRuntime> {
  const backend = new PlaywrightMockAdapter();
  return buildPokedexPaymentRuntime(parsePaymentEnv(env), backend, backend);
}

class PlaywrightMockAdapter extends MockAdapter implements MockPaymentController {
  #nonce = 0;
  readonly #preimages = new Map<string, string>();

  override async createInvoice(request: CreateInvoiceRequest): Promise<CreatedInvoice> {
    const preimage = deterministicPreimage(this.#nonce);
    this.#nonce += 1;
    const paymentHash = await sha256Hex(hexToBytes(preimage));
    const created = await super.createInvoice({ ...request, paymentHash });
    this.#preimages.set(created.paymentHash, preimage);
    return {
      ...created,
      paymentRequest: `lnbcrt${created.amountMsat.toString()}n1${created.paymentHash}`,
    };
  }

  async settleChallenge(challengeHeader: string): Promise<string> {
    const { buildAuthorizationHeader, decodeIdentifier, parseAuthenticateHeader } =
      await loadServerL402();
    const challenges = parseAuthenticateHeader(challengeHeader);
    const challenge = challenges.find((entry) => entry.scheme === "L402") ?? challenges[0];
    if (challenge === undefined) {
      throw new PaymentConfigError("Missing L402 challenge");
    }

    const paymentHash = bytesToHex(decodeIdentifier(challenge.macaroon).paymentHash);
    const preimage = this.#preimages.get(paymentHash);
    if (preimage === undefined) {
      throw new PaymentConfigError("No matching mock invoice for challenge");
    }

    this.settle(paymentHash, preimage);
    return buildAuthorizationHeader({ macaroons: challenge.macaroon, preimage });
  }
}

function deterministicPreimage(nonce: number): string {
  const seed = `boltwall-playground-pokedex-${nonce}`;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = seed.charCodeAt(i % seed.length) ^ ((i * 31 + nonce) & 0xff);
  }
  return bytesToHex(bytes);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return bytesToHex(new Uint8Array(digest));
}

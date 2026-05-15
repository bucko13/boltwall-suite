import { bytesToHex, hexToBytes32 } from "@boltwall/internal";

import type {
  BackendCapabilities,
  BackendKind,
  CreatedInvoice,
  CreateInvoiceRequest,
  InvoiceLookup,
  LightningBackend,
} from "../types";

const HEX_32_BYTES_LENGTH = 64;

interface StoredInvoice extends InvoiceLookup {
  paymentRequest: string;
  expiresAt?: Date;
  hodl: boolean;
}

/**
 * Deterministic in-memory Lightning backend for middleware, proxy, and
 * playground tests.
 *
 * The mock intentionally advertises the full backend capability surface so
 * downstream tests can exercise HODL, cancellation, subscription, and custom
 * description flows without a real Lightning node. Its `paymentRequest` values
 * are mock placeholders, not real BOLT 11 invoices.
 */
export class MockAdapter implements LightningBackend {
  readonly kind: BackendKind = "mock";
  readonly capabilities: BackendCapabilities = {
    hodl: true,
    cancelInvoice: true,
    streamingInvoices: true,
    customDescription: true,
  };

  #nonce = 0;
  readonly #invoices = new Map<string, StoredInvoice>();
  readonly #listeners = new Set<(invoice: InvoiceLookup) => void>();

  async createInvoice(request: CreateInvoiceRequest): Promise<CreatedInvoice> {
    const paymentHash = normalizePaymentHash(
      request.paymentHash ?? this.#nextPaymentHash(request),
    );
    if (request.hodl === true && request.paymentHash === undefined) {
      throw new Error("mock-hodl-payment-hash-required");
    }

    const expiresAt =
      request.expirySeconds === undefined
        ? undefined
        : new Date(Date.now() + request.expirySeconds * 1000);
    const invoice: StoredInvoice = {
      status: "open",
      paymentHash,
      amountMsat: request.amountMsat,
      paymentRequest: buildMockPaymentRequest(request.amountMsat, paymentHash),
      hodl: request.hodl === true,
      ...(expiresAt === undefined ? {} : { expiresAt }),
    };
    this.#invoices.set(paymentHash, invoice);
    this.#emit(invoice);

    return {
      paymentRequest: invoice.paymentRequest,
      paymentHash,
      amountMsat: request.amountMsat,
      ...(expiresAt === undefined ? {} : { expiresAt }),
    };
  }

  async lookupInvoice(paymentHash: string): Promise<InvoiceLookup> {
    return copyLookup(this.#requireInvoice(paymentHash));
  }

  async cancelInvoice(paymentHash: string): Promise<void> {
    this.#transition(paymentHash, { status: "canceled" });
  }

  async settleHodlInvoice(preimage: string): Promise<void> {
    const paymentHash = await sha256Hex(hexToBytes(preimage, "preimage"));
    const invoice = this.#invoices.get(paymentHash);
    if (invoice === undefined || invoice.hodl !== true) {
      throw new Error("mock-hodl-preimage-mismatch");
    }
    this.#transition(paymentHash, { status: "settled", preimage: normalizeHex(preimage) });
  }

  async *subscribeInvoices(): AsyncIterable<InvoiceLookup> {
    const queue: InvoiceLookup[] = [];
    let resume: ((invoice: InvoiceLookup) => void) | undefined;
    const listener = (invoice: InvoiceLookup): void => {
      if (resume === undefined) {
        queue.push(invoice);
        return;
      }
      const resolve = resume;
      resume = undefined;
      resolve(invoice);
    };

    this.#listeners.add(listener);
    try {
      while (true) {
        const queued = queue.shift();
        if (queued !== undefined) {
          yield queued;
          continue;
        }
        yield await new Promise<InvoiceLookup>((resolve) => {
          resume = resolve;
        });
      }
    } finally {
      this.#listeners.delete(listener);
    }
  }

  /**
   * Test helper that marks an invoice settled without waiting for payment.
   */
  settle(paymentHash: string, preimage?: string): void {
    const normalizedHash = normalizePaymentHash(paymentHash);
    this.#transition(normalizedHash, {
      status: "settled",
      preimage: preimage === undefined ? deterministicHex(normalizedHash) : normalizeHex(preimage),
    });
  }

  /**
   * Test helper that marks a HODL invoice held after the payer's HTLC is accepted.
   */
  hold(paymentHash: string): void {
    this.#transition(paymentHash, { status: "held" });
  }

  /**
   * Test helper that marks an invoice expired.
   */
  expire(paymentHash: string): void {
    this.#transition(paymentHash, { status: "expired" });
  }

  #nextPaymentHash(request: CreateInvoiceRequest): string {
    const seed = JSON.stringify({
      amountMsat: request.amountMsat.toString(),
      description: request.description ?? "",
      metadata: request.metadata ?? {},
      nonce: this.#nonce,
    });
    this.#nonce += 1;
    return deterministicHex(seed);
  }

  #transition(paymentHash: string, patch: Partial<InvoiceLookup>): void {
    const invoice = this.#requireInvoice(paymentHash);
    const updated: StoredInvoice = {
      ...invoice,
      ...patch,
    };
    this.#invoices.set(invoice.paymentHash, updated);
    this.#emit(updated);
  }

  #requireInvoice(paymentHash: string): StoredInvoice {
    const invoice = this.#invoices.get(normalizePaymentHash(paymentHash));
    if (invoice === undefined) {
      throw new Error("mock-invoice-not-found");
    }
    return invoice;
  }

  #emit(invoice: StoredInvoice): void {
    const lookup = copyLookup(invoice);
    for (const listener of this.#listeners) {
      listener(lookup);
    }
  }
}

function buildMockPaymentRequest(amountMsat: bigint, paymentHash: string): string {
  return `mockbolt11_${amountMsat.toString()}_${paymentHash}`;
}

function copyLookup(invoice: InvoiceLookup): InvoiceLookup {
  return {
    status: invoice.status,
    paymentHash: invoice.paymentHash,
    ...(invoice.amountMsat === undefined ? {} : { amountMsat: invoice.amountMsat }),
    ...(invoice.settledAt === undefined ? {} : { settledAt: new Date(invoice.settledAt) }),
    ...(invoice.preimage === undefined ? {} : { preimage: invoice.preimage }),
  };
}

function normalizePaymentHash(value: string): string {
  const normalized = normalizeHex(value);
  if (normalized.length !== HEX_32_BYTES_LENGTH) {
    throw new Error("invalid-payment-hash");
  }
  return normalized;
}

function normalizeHex(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized)) {
    throw new Error("invalid-hex");
  }
  return normalized;
}

function hexToBytes(value: string, label: string): Uint8Array {
  try {
    return hexToBytes32(normalizeHex(value), label);
  } catch {
    throw new Error(`invalid-${label}`);
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

function deterministicHex(seed: string): string {
  let state = 0x811c9dc5;
  const out = new Uint8Array(32);
  for (let i = 0; i < out.length; i += 1) {
    const code = seed.charCodeAt(i % seed.length);
    state ^= code + i;
    state = Math.imul(state, 0x01000193);
    out[i] = state & 0xff;
  }
  return bytesToHex(out);
}

import { sha256 } from "@noble/hashes/sha2.js";

const PAYMENT_HASH_LENGTH = 32;
const PREIMAGE_LENGTH = 32;
const HEX_RE = /^[0-9a-fA-F]+$/;

/**
 * Either a 32-byte `Uint8Array` or a 64-char hex string. Internal helpers
 * normalize both to `Uint8Array` at the function boundary.
 */
type Bytes32Input = Uint8Array | string;

export interface VerifyPreimageArgs {
  /** Payment hash (32 bytes) embedded in the macaroon's v0 identifier. */
  paymentHash: Bytes32Input;
  /** Lightning payment preimage (32 bytes) revealed after invoice settlement. */
  preimage: Bytes32Input;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new RangeError("hex string must have an even number of characters");
  }
  if (!HEX_RE.test(hex)) {
    throw new RangeError("hex string contains non-hex characters");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = hex.charCodeAt(i * 2);
    const lo = hex.charCodeAt(i * 2 + 1);
    // Inline hex decode is faster than `parseInt(hex.slice(i*2, i*2+2), 16)`
    // and avoids allocating substrings for every byte.
    const hiV = hi <= 57 ? hi - 48 : (hi & 0x0f) + 9;
    const loV = lo <= 57 ? lo - 48 : (lo & 0x0f) + 9;
    out[i] = (hiV << 4) | loV;
  }
  return out;
}

function normalizeBytes32(value: Bytes32Input, label: string): Uint8Array {
  const bytes = typeof value === "string" ? hexToBytes(value) : value;
  if (bytes.length !== PAYMENT_HASH_LENGTH) {
    throw new RangeError(
      `${label} must be ${String(PAYMENT_HASH_LENGTH)} bytes, got ${String(bytes.length)}`,
    );
  }
  return bytes;
}

/**
 * Constant-time `Uint8Array` equality. Lengths are public information per
 * standard timing-safe comparison practice and are checked first; the
 * byte-level comparison runs in time independent of which (if any) byte
 * differs first.
 *
 * TODO(bw-1dl.1, Phase 2): replace with the dedicated
 * `@boltwall/internal/timing-safe-equal.ts` helper when it lands. Inline
 * here for Phase 1 per the bw-b63.7 acceptance criteria.
 */
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    // Force read of every byte; bitwise OR accumulates without short-circuit.
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Verify that a Lightning payment preimage hashes to the macaroon's
 * `payment_hash` — i.e. that the bearer of this credential paid the
 * invoice the macaroon was minted against.
 *
 * Spec citation:
 * - L402 macaroon-spec, "Identifier" section: the v0 identifier embeds
 *   `payment_hash` (32 bytes). The credential carries `preimage` (32
 *   bytes); the verifier MUST check `sha256(preimage) === payment_hash`
 *   in constant time.
 *
 * Inputs may be `Uint8Array` (32 bytes) or hex `string` (64 chars,
 * case-insensitive). Both are normalized to `Uint8Array` at the boundary.
 *
 * Throws `RangeError` on length mismatch (length is not secret) and on
 * malformed hex strings; returns `false` for any other mismatch (do NOT
 * throw on cryptographic failure — surface that as a boolean to the
 * caller, who decides how to translate it into HTTP 401 / log lines).
 *
 * @example
 * verifyPreimage({
 *   paymentHash: "00112233...",
 *   preimage: "ffeeddcc...",
 * }); // → boolean
 */
export function verifyPreimage(args: VerifyPreimageArgs): boolean {
  const paymentHash = normalizeBytes32(args.paymentHash, "paymentHash");
  const preimage = normalizeBytes32(args.preimage, "preimage");
  if (preimage.length !== PREIMAGE_LENGTH) {
    throw new RangeError(
      `preimage must be ${String(PREIMAGE_LENGTH)} bytes, got ${String(preimage.length)}`,
    );
  }

  const computed = sha256(preimage);
  return timingSafeEqualBytes(computed, paymentHash);
}

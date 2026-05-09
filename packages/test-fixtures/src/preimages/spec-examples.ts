export interface PreimageFixture {
  name: string;
  source: string;
  paymentHashHex: string;
  preimageHex: string;
  expected:
    | { ok: true }
    | { ok: false; reason: "mismatch" };
}

// Vector pinned against a well-known SHA-256 test vector: sha256 of 32
// zero bytes. Verified with `node -e "import('crypto').then(c => process.stdout.write(c.createHash('sha256').update(Buffer.alloc(32)).digest('hex')))"`.
export const ZERO_PREIMAGE_HEX =
  "0000000000000000000000000000000000000000000000000000000000000000";
export const ZERO_PREIMAGE_PAYMENT_HASH_HEX =
  "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925";

// Vector 2: a non-trivial preimage (32 random bytes); hash must be
// computed at test-construction time, not pinned, since the consumer does
// not need a stable round-trip vector here — they just need both
// directions to agree.
export const NONTRIVIAL_PREIMAGE_HEX =
  "11223344556677881100229933884477aabbccddee00112233445566778899aa";

// Adversarial: the same preimage as ZERO but the payment hash differs in
// exactly one byte (bit-flipped low nibble of byte 0). Drives the
// constant-time path.
export const NEAR_MISS_PAYMENT_HASH_HEX =
  "67687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925";

export const specPreimageFixtures: PreimageFixture[] = [
  {
    name: "zero-preimage-canonical",
    source:
      "Well-known SHA-256 test vector: sha256(32 × 0x00). Verified externally; pinned in source.",
    paymentHashHex: ZERO_PREIMAGE_PAYMENT_HASH_HEX,
    preimageHex: ZERO_PREIMAGE_HEX,
    expected: { ok: true },
  },
  {
    name: "near-miss-rejects",
    source: "hand-authored adversarial vector — single-byte mismatch in paymentHash",
    paymentHashHex: NEAR_MISS_PAYMENT_HASH_HEX,
    preimageHex: ZERO_PREIMAGE_HEX,
    expected: { ok: false, reason: "mismatch" },
  },
  {
    name: "completely-different-rejects",
    source: "hand-authored adversarial vector — preimage bears no relation to paymentHash",
    paymentHashHex:
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    preimageHex: ZERO_PREIMAGE_HEX,
    expected: { ok: false, reason: "mismatch" },
  },
];

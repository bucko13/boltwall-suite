export interface Bolt11InvoiceFixture {
  name: string;
  invoice: string;
  paymentHashHex: string;
  amountMsat: bigint;
  expiresAtIso: string;
  description?: string;
  network: "mainnet" | "testnet" | "signet" | "regtest";
}

const SPEC_PAYMENT_HASH =
  "0001020304050607080900010203040506070809000102030405060708090102";

export const BOLT11_SPEC_EXAMPLES: Bolt11InvoiceFixture[] = [
  {
    name: "bolt11-spec-amountless-mainnet",
    invoice:
      "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq9qrsgq357wnc5r2ueh7ck6q93dj32dlqnls087fxdwk8qakdyafkq3yap9us6v52vjjsrvywa6rt52cm9r9zqt8r2t7mlcwspyetp5h2tztugp9lfyql",
    paymentHashHex: SPEC_PAYMENT_HASH,
    amountMsat: 0n,
    expiresAtIso: "2017-06-01T11:57:38.000Z",
    description: "Please consider supporting this project",
    network: "mainnet",
  },
  {
    name: "bolt11-spec-microbtc-mainnet",
    invoice:
      "lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh",
    paymentHashHex: SPEC_PAYMENT_HASH,
    amountMsat: 250_000_000n,
    expiresAtIso: "2017-06-01T10:58:38.000Z",
    description: "1 cup coffee",
    network: "mainnet",
  },
  {
    name: "bolt11-spec-millibtc-mainnet",
    invoice:
      "lnbc20m1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqhp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqs9qrsgq7ea976txfraylvgzuxs8kgcw23ezlrszfnh8r6qtfpr6cxga50aj6txm9rxrydzd06dfeawfk6swupvz4erwnyutnjq7x39ymw6j38gp7ynn44",
    paymentHashHex: SPEC_PAYMENT_HASH,
    amountMsat: 2_000_000_000n,
    expiresAtIso: "2017-06-01T11:57:38.000Z",
    network: "mainnet",
  },
  {
    name: "bolt11-spec-millibtc-testnet",
    invoice:
      "lntb20m1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygshp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqfpp3x9et2e20v6pu37c5d9vax37wxq72un989qrsgqdj545axuxtnfemtpwkc45hx9d2ft7x04mt8q7y6t0k2dge9e7h8kpy9p34ytyslj3yu569aalz2xdk8xkd7ltxqld94u8h2esmsmacgpghe9k8",
    paymentHashHex: SPEC_PAYMENT_HASH,
    amountMsat: 2_000_000_000n,
    expiresAtIso: "2017-06-01T11:57:38.000Z",
    network: "testnet",
  },
];

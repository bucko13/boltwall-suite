# LndAdapter Regtest Verification

`LndAdapter` talks to LND through the maintained `lightning` npm package. Unit
tests stub that package, so this manual smoke confirms the real gRPC path.

## Polar Lightning

1. Start a Polar regtest network with at least one LND node and one paying peer.
2. Open and fund a channel from the paying peer to the LND node.
3. In Polar, copy the LND node's gRPC socket, TLS certificate, and admin macaroon.
4. Convert the certificate and macaroon to the base64 strings expected by
   `LndAdapterOptions`.
5. Create an adapter:

   ```ts
   import { LndAdapter } from "@boltwall/adapters/lnd";

   const lnd = new LndAdapter({
     socket: "127.0.0.1:10009",
     cert: process.env.LND_CERT_BASE64!,
     macaroon: process.env.LND_MACAROON_BASE64!,
   });
   ```

6. Call `createInvoice({ amountMsat: 1000n, description: "boltwall-regtest" })`.
   The expected result is a real `lnbcrt...` BOLT 11 payment request and an
   `open` lookup state for its payment hash.
7. Pay the invoice from the peer node.
8. Call `lookupInvoice(paymentHash)` again. The expected result is:

   ```ts
   {
     status: "settled",
     paymentHash: "<64 lowercase hex chars>",
     amountMsat: 1000n,
     preimage: "<64 lowercase hex chars>"
   }
   ```

## HODL Flow

For HODL verification, create a 32-byte preimage, hash it with SHA-256, and pass
the hash to:

```ts
await lnd.createInvoice({
  amountMsat: 1000n,
  description: "boltwall-hodl-regtest",
  hodl: true,
  paymentHash,
});
```

After the paying peer sends the payment and LND reports the invoice as held,
call `settleHodlInvoice(preimage)` and verify `lookupInvoice(paymentHash)` moves
to `settled`. If the payment should be abandoned, call
`cancelInvoice(paymentHash)` before the CLTV timeout.

## Recorded Manual Run

Not yet run in this repository session. The implementation and stubbed unit
tests are ready; closing the task still requires an owner-machine regtest run
with real socket, certificate, macaroon, BOLT 11 request, open lookup, payment,
and settled lookup evidence pasted here.

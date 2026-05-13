import express from "express";

import { MockAdapter } from "@boltwall/adapters/testing";
import { InMemoryRootKeyStore } from "@boltwall/l402";
import { boltwall, validUntil } from "@boltwall/middleware/express";

const app = express();
const backend = new MockAdapter();
const rootKeyStore = new InMemoryRootKeyStore();

app.use(
  "/paid",
  boltwall({
    service: "example-api",
    backend,
    rootKeyStore,
    price: 100_000n, // 100 sats in millisatoshis
    caveats: [validUntil({ seconds: 3600 })],
  }),
);

app.get("/paid/data", (req, res) => {
  // req.l402 is attached by boltwall on successful authorization.
  // The type augmentation ships with @boltwall/middleware/express.
  const paymentHash = (req as { l402?: { paymentHash: string } }).l402?.paymentHash;
  res.json({ message: "You paid! Here is the protected data.", paymentHash });
});

app.listen(3000, () => {
  console.log("Listening on http://localhost:3000");
  console.log('Try: curl http://localhost:3000/paid/data');
});

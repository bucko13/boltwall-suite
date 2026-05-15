import { InMemoryRootKeyStore } from "@boltwall/l402";
import { createProxy } from "@boltwall/proxy";
import type { Express } from "express";

import { createBackend, loadBoltwallEnv } from "./env.js";

const env = loadBoltwallEnv(process.env);

const app: Express = createProxy({
  ...env.proxy,
  backend: createBackend(env.backend),
  rootKeyStore: new InMemoryRootKeyStore(),
});

export default app;

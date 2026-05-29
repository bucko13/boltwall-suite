import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/lnd/index.ts",
    "src/opennode/index.ts",
    "src/btcpay/index.ts",
    "src/testing/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  noExternal: ["@boltwall/internal"],
});

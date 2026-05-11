import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/wallet/index.ts",
    "src/legacy/index.ts",
    "src/pricing.ts",
    "src/testing/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  noExternal: ["@noble/hashes", "light-bolt11-decoder"],
});

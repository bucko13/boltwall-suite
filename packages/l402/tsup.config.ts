import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  // The bundled CJS deps below (macaroon, sjcl, tweetnacl) compile to `require(...)`
  // calls. tsup's ESM output replaces bare `require` with a `__require` shim that
  // throws under runtimes without a CJS loader (Vercel's /opt/rust runtime). Re-bind
  // `require` to a real one via createRequire so those deps resolve node builtins
  // (e.g. crypto) at runtime instead of throwing "Dynamic require of crypto".
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  noExternal: [
    "@noble/hashes",
    "light-bolt11-decoder",
    "macaroon",
    "sjcl",
    "tweetnacl",
    "tweetnacl-util",
  ],
});

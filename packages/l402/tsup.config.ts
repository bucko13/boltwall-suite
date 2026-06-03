import { defineConfig } from "tsup";

// The bundled CJS deps below (macaroon, sjcl, tweetnacl) compile to `require(...)`
// calls. tsup's ESM output replaces bare `require` with a `__require` shim that
// throws "Dynamic require of crypto is not supported" under runtimes without a CJS
// loader (Vercel's serverless runtime), where the ambient `require` is undefined.
const noExternal = [
  "@noble/hashes",
  "light-bolt11-decoder",
  "macaroon",
  "sjcl",
  "tweetnacl",
  "tweetnacl-util",
];

// Two builds resolved via package.json export conditions, because the same package
// is imported from both node (the proxy/adapters, including the generated Vercel
// function) and the browser (the playground bundles the browser-safe APIs through
// webpack). The fix for the node "Dynamic require of crypto" crash is a createRequire
// banner — but any reference to `node:module` (even a runtime-guarded dynamic import)
// breaks browser bundlers, which statically reject the `node:` scheme. So the banner
// lives only in the `node` build; the browser/`default` build ships without it.
export default defineConfig([
  // Browser / default: no node:module reference at all. Browser code paths never
  // touch the bundled crypto deps, so the unbound `__require` shim is never called.
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    noExternal,
  },
  // Node: only node ever loads this output, so a plain static createRequire import is
  // safe and binds a real `require` for the bundled CJS deps to resolve node builtins.
  {
    entry: { "index.node": "src/index.ts" },
    format: ["esm"],
    dts: false,
    clean: false,
    sourcemap: true,
    noExternal,
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
  },
]);

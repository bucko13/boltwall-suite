import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  // The bundled CJS deps below (macaroon, sjcl, tweetnacl) compile to `require(...)`
  // calls. tsup's ESM output replaces bare `require` with a `__require` shim that
  // throws "Dynamic require of crypto is not supported" under runtimes without a CJS
  // loader (Vercel's serverless runtime), where the ambient `require` is undefined.
  // Bind `require` to a real one via createRequire so those deps resolve node builtins.
  //
  // This must stay browser-safe: the same bundle is imported in the browser (the
  // browser-safe APIs never touch crypto). A *static* `import "node:module"` would
  // make the whole module fail to load in a browser, and even a bare dynamic import
  // logs a failed-fetch console error there. So gate it on a node check: browsers
  // never attempt the import and fall back to an undefined `require` (restoring the
  // original lazy-throw behaviour that browser code paths never trigger), while node
  // and node-compatible runtimes (Vercel functions) get a real createRequire.
  banner: {
    js: "const require = await (async () => { try { if (typeof process !== 'undefined' && process.versions && process.versions.node) { const m = await import('node:module'); return m.createRequire(import.meta.url); } } catch {} return undefined; })();",
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

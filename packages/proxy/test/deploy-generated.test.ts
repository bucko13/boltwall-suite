import { createHmac } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { loadBoltwallConfig } from "../src/config-loader";
import { deployVercel } from "../src/deploy/vercel";

// Regression coverage for the generated Vercel app (api/index.ts). The template
// is a string the package never typechecks at build time, so these guard the
// shapes that previously broke a real `vercel` build:
//   - `hodl: true` widened to `boolean` (rejected by ProxyConfig's `hodl?: true`)
//   - `EnvRootKeyStore` referenced before its class declaration (TS2449 / TDZ)
//   - implicitly-typed class members under strict typechecking
const BACKENDS = {
  lnd: {
    yaml: ["backend:", "  kind: lnd"],
    env: { LND_SOCKET: "node:10009", LND_TLS_CERT: "Zm9v", LND_MACAROON: "YmFy" },
  },
  opennode: {
    yaml: ["backend:", "  kind: opennode"],
    env: { OPENNODE_API_KEY: "test-key" },
  },
} as const;

async function generateApiIndex(kind: keyof typeof BACKENDS = "lnd"): Promise<string> {
  const backend = BACKENDS[kind];
  const dir = await mkdtemp(join(tmpdir(), "boltwall-generated-"));
  await writeFile(
    join(dir, "boltwall.yaml"),
    [
      "name: pokedex",
      "targetUrl: https://pokeapi.co/api/v2",
      ...backend.yaml,
      "pricing:",
      '  defaultPriceMsat: "1000"',
      "deploy:",
      "  projectName: pokedex",
    ].join("\n"),
  );

  await deployVercel({
    config: await loadBoltwallConfig(join(dir, "boltwall.yaml")),
    // No BOLTWALL_PROXY_ROOT_KEY: the deploy generates a random one when it is
    // absent, and the key never appears in the generated source we assert on.
    env: backend.env,
    secretValues: {},
    production: false,
    configDir: dir,
    runner: { run: async () => ({ code: 0, stdout: "https://pokedex.vercel.app", stderr: "" }) },
  });

  return readFile(join(dir, "deployments", "pokedex", "api", "index.ts"), "utf8");
}

async function generateVercelJson(kind: keyof typeof BACKENDS = "lnd"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "boltwall-generated-"));
  await writeFile(
    join(dir, "boltwall.yaml"),
    [
      "name: pokedex",
      "targetUrl: https://pokeapi.co/api/v2",
      ...BACKENDS[kind].yaml,
      "pricing:",
      '  defaultPriceMsat: "1000"',
      "deploy:",
      "  projectName: pokedex",
    ].join("\n"),
  );
  await deployVercel({
    config: await loadBoltwallConfig(join(dir, "boltwall.yaml")),
    env: BACKENDS[kind].env,
    secretValues: {},
    production: false,
    configDir: dir,
    runner: { run: async () => ({ code: 0, stdout: "https://pokedex.vercel.app", stderr: "" }) },
  });
  return readFile(join(dir, "deployments", "pokedex", "vercel.json"), "utf8");
}

describe("generated Vercel api/index.ts", () => {
  test("requires the deployment secret for a derived, restart-safe root-key store", async () => {
    const source = await generateApiIndex();
    const declaration = source.indexOf("class EnvRootKeyStore");
    const usage = source.indexOf("new EnvRootKeyStore(");
    expect(declaration).toBeGreaterThanOrEqual(0);
    expect(usage).toBeGreaterThanOrEqual(0);
    // Classes are not hoisted: the declaration must precede the top-level use.
    expect(declaration).toBeLessThan(usage);
    // The secret is required at boot — production never silently falls back to
    // a process-local in-memory store.
    expect(source).toContain(
      'rootKeyStore: new EnvRootKeyStore(requireEnv("BOLTWALL_PROXY_ROOT_KEY"))',
    );
    expect(source).not.toContain("InMemoryRootKeyStore");
  });

  test("emits a literal-typed, strict-clean config", async () => {
    const source = await generateApiIndex();
    // `hodl` must stay the literal `true`, not widen to `boolean`.
    expect(source).toContain("hodl: true as const");
    expect(source).not.toMatch(/\{ hodl: true \}/);
    // Class members are typed so the generated app passes strict typechecking.
    expect(source).toContain("constructor(secret: string)");
    expect(source).toContain("get(tokenId: Uint8Array)");
  });

  test("derives keys identically to the exported DerivedRootKeyStore", async () => {
    // The generated EnvRootKeyStore is a copy of the exported DerivedRootKeyStore
    // (kept in sync by a comment until bw-743o swaps it for the import). If the
    // two derivations drift, the eventual import-swap silently invalidates every
    // credential a deployed proxy minted. Execute the generated class and pin it
    // to the same known-answer vector the exported store is pinned to in
    // root-key-store.test.ts ("matches the pinned known-answer derivation vector").
    const source = await generateApiIndex();
    const start = source.indexOf("class EnvRootKeyStore");
    const end = source.indexOf("const app = createProxy");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    // Strip TS types from the extracted class and instantiate it directly.
    // createHmac is injected; Buffer is a global the generated class relies on.
    const classJs = new Bun.Transpiler({ loader: "ts" }).transformSync(source.slice(start, end));
    const EnvRootKeyStore = new Function("createHmac", `${classJs}\nreturn EnvRootKeyStore;`)(
      createHmac,
    ) as new (secret: string) => { get(id: Uint8Array): Promise<Uint8Array> };

    const SECRET_HEX = "ab".repeat(32);
    // Not a secret: the deterministic HMAC fixture also pinned in
    // root-key-store.test.ts. gitleaks:allow (high-entropy hex, not a credential).
    const KNOWN_ANSWER_KEY_HEX =
      "1d72defb48f81153687f47e2d840285d247b0e51c9af949c486a9b42e2386e17"; // gitleaks:allow
    const key = await new EnvRootKeyStore(SECRET_HEX).get(new Uint8Array(32).fill(7));
    expect(Buffer.from(key).toString("hex")).toBe(KNOWN_ANSWER_KEY_HEX);
  });

  test("forces lightning's runtime assets into the LND function via includeFiles", async () => {
    const vercelJson = JSON.parse(await generateVercelJson("lnd")) as {
      functions?: Record<string, { includeFiles?: string }>;
    };
    // lightning reads its grpc/protos/*.proto and tiny-secp256k1 reads
    // secp256k1.wasm from disk at runtime; the tracer drops them, so they must be
    // pulled into the function explicitly. The extension-brace glob covers both
    // without enumerating lightning's proto set.
    const includeFiles = vercelJson.functions?.["api/index.ts"]?.includeFiles;
    expect(includeFiles).toBe("node_modules/**/*.{proto,wasm}");
  });

  test("wires LND cert resolution with a system-roots fallback", async () => {
    const source = await generateApiIndex("lnd");
    // Guard that the generated app routes the cert through resolution and keeps the
    // system-roots fallback for managed nodes. The resolution *behavior* (PEM
    // detection, base64/hex passthrough, system-roots encoding) is covered by the
    // adapter's resolveLndCert test, which runs it; asserting the exact expression
    // text here would be brittle without adding coverage.
    expect(source).toContain("cert: lndCert()");
    expect(source).toContain("rootCertificates");
  });

  test("trusts the proxy so TLS-terminated requests are not rejected as non-HTTPS", async () => {
    const source = await generateApiIndex("opennode");
    // Vercel forwards to the function over HTTP after terminating TLS; without
    // trusting the proxy, Express reports req.protocol === "http" and the L402
    // middleware 400s every request as non-TLS.
    expect(source).toContain('app.set("trust proxy", true)');
  });

  test("omits the includeFiles function config for non-LND backends", async () => {
    const vercelJson = JSON.parse(await generateVercelJson("opennode")) as {
      functions?: unknown;
    };
    expect(vercelJson.functions).toBeUndefined();
  });
});

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
  nwc: {
    yaml: ["backend:", "  kind: nwc"],
    env: {
      NWC_CONNECTION_STRING:
        "nostr+walletconnect://wallet?relay=wss%3A%2F%2Frelay.example&secret=secret",
    },
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
  test("declares EnvRootKeyStore before it is used", async () => {
    const source = await generateApiIndex();
    const declaration = source.indexOf("class EnvRootKeyStore");
    const usage = source.indexOf("new EnvRootKeyStore(");
    expect(declaration).toBeGreaterThanOrEqual(0);
    expect(usage).toBeGreaterThanOrEqual(0);
    // Classes are not hoisted: the declaration must precede the top-level use.
    expect(declaration).toBeLessThan(usage);
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

  test("wires NWC through a sensitive runtime env var", async () => {
    const source = await generateApiIndex("nwc");

    expect(source).toContain('import { NwcAdapter } from "@boltwall/adapters/nwc"');
    expect(source).toContain("new NwcAdapter({");
    expect(source).toContain('nostrWalletConnectUrl: requireEnv("NWC_CONNECTION_STRING")');
    expect(source).not.toContain("nostr+walletconnect://wallet");
    expect(source).not.toContain("secret=secret");
  });

  test("omits the includeFiles function config for non-LND backends", async () => {
    for (const kind of ["opennode", "nwc"] as const) {
      const vercelJson = JSON.parse(await generateVercelJson(kind)) as {
        functions?: unknown;
      };
      expect(vercelJson.functions).toBeUndefined();
    }
  });
});

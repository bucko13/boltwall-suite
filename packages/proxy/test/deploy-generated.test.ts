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

  test("forces tiny-secp256k1's wasm into the bundle for the LND backend", async () => {
    const source = await generateApiIndex("lnd");
    // new URL(<literal>, import.meta.url) is the pattern Vercel's file tracer
    // follows, so this bundles secp256k1.wasm (which lightning loads at runtime
    // via a readFileSync the tracer cannot see) and avoids the ENOENT crash.
    expect(source).toContain('new URL("../node_modules/tiny-secp256k1/lib/secp256k1.wasm"');
  });

  test("forces lightning's gRPC protos into the bundle for the LND backend", async () => {
    const source = await generateApiIndex("lnd");
    // lightning reads its grpc/protos/*.proto from disk at runtime; the tracer
    // drops them, so each must be referenced via new URL the same way as the wasm.
    // autopilot.proto is the one the real deploy crashed on; lightning.proto is the
    // core service definition. A representative pair guards the whole proto list.
    expect(source).toContain('new URL("../node_modules/lightning/grpc/protos/autopilot.proto"');
    expect(source).toContain('new URL("../node_modules/lightning/grpc/protos/lightning.proto"');
  });

  test("omits the LND runtime-asset hints for non-LND backends", async () => {
    const source = await generateApiIndex("opennode");
    expect(source).not.toContain("tiny-secp256k1");
    expect(source).not.toContain("grpc/protos");
  });
});

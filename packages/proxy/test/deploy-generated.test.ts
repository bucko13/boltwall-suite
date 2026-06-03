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
async function generateApiIndex(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "boltwall-generated-"));
  await writeFile(
    join(dir, "boltwall.yaml"),
    [
      "name: pokedex",
      "targetUrl: https://pokeapi.co/api/v2",
      "backend:",
      "  kind: lnd",
      "pricing:",
      '  defaultPriceMsat: "1000"',
      "deploy:",
      "  projectName: pokedex",
    ].join("\n"),
  );

  await deployVercel({
    config: await loadBoltwallConfig(join(dir, "boltwall.yaml")),
    env: {
      LND_SOCKET: "node:10009",
      LND_TLS_CERT: "Zm9v",
      LND_MACAROON: "YmFy",
      BOLTWALL_PROXY_ROOT_KEY: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
    },
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
});

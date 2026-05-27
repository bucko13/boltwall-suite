import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { loadBoltwallConfig } from "../src/config-loader";
import { listSavedConfigs } from "../src/config-store";

describe("boltwall config loading", () => {
  test("loads JSON and YAML configs", async () => {
    const dir = await fixtureDir("config-loading");
    const jsonPath = join(dir, "json-config.json");
    const yamlPath = join(dir, "yaml-config.yaml");

    await writeFile(jsonPath, JSON.stringify(validConfig("json-config")));
    await writeFile(
      yamlPath,
      [
        "name: yaml-config",
        "targetUrl: https://api.example.com",
        "backend:",
        "  kind: opennode",
        "pricing:",
        '  defaultPriceMsat: "1000"',
        "policy:",
        "  validUntilSeconds: 60",
        "  capabilities: [pokedex-read]",
        "routes:",
        "  - path: /premium/*",
        "    methods: [GET]",
        '    priceMsat: "1000"',
      ].join("\n"),
    );

    await expect(loadBoltwallConfig(jsonPath)).resolves.toMatchObject({ name: "json-config" });
    await expect(loadBoltwallConfig(yamlPath)).resolves.toMatchObject({
      name: "yaml-config",
      policy: { validUntilSeconds: 60, capabilities: ["pokedex-read"] },
    });
  });

  test("reports missing config paths without leaking values", async () => {
    await expect(
      loadBoltwallConfig("/private/tmp/boltwall-missing-secret-token.yaml"),
    ).rejects.toThrow(/Config not found/);
  });

  test("discovers saved configs under the config directory", async () => {
    const dir = await fixtureDir("saved-configs");
    await writeFile(join(dir, "default.yaml"), "name: default\n");
    await writeFile(join(dir, "pokedex.json"), "{}\n");
    await writeFile(join(dir, "notes.txt"), "ignored\n");

    await expect(listSavedConfigs(dir)).resolves.toEqual([
      { name: "default", path: join(dir, "default.yaml") },
      { name: "pokedex", path: join(dir, "pokedex.json") },
    ]);
  });
});

function validConfig(name: string): unknown {
  return {
    name,
    targetUrl: "https://api.example.com",
    backend: { kind: "opennode" },
    pricing: { defaultPriceMsat: "1000" },
    routes: [{ path: "/premium/*", methods: ["GET"], priceMsat: "1000" }],
  };
}

async function fixtureDir(label: string): Promise<string> {
  const dir = join(
    tmpdir(),
    `boltwall-proxy-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  return dir;
}

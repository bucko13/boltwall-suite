import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import { describe, expect, test } from "bun:test";

import { runCli, type PromptDriver } from "../src/cli";
import type { CommandResult, CommandRunner } from "../src/deploy/vercel";

describe("boltwall CLI", () => {
  test("prints compact help", async () => {
    const stdout = new CaptureStream();
    await expect(runCli({ argv: ["--help"], stdout })).resolves.toBe(0);
    expect(stdout.text()).toContain("deploy [--config <name-or-path>]");
    expect(stdout.text()).not.toContain("deploy vercel");
  });

  test("validate reports missing config names and paths", async () => {
    const stderr = new CaptureStream();
    const code = await runCli({
      argv: ["validate", "--config", "missing-config"],
      configDir: await fixtureDir("missing-config-dir"),
      stderr,
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain("Config not found: missing-config");
    expect(stderr.text()).toContain('saved config "missing-config"');
  });

  test("validate auto-uses the only saved config", async () => {
    const dir = await fixtureDir("validate-single");
    await writeFile(join(dir, "pokedex.yaml"), yamlConfig());
    const stdout = new CaptureStream();

    const code = await runCli({
      argv: ["validate"],
      stdout,
      configDir: dir,
      env: { OPENNODE_API_KEY: "test-api-key" },
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain('"backend": "opennode"');
    expect(stdout.text()).toContain('"paywallMode": "standard-invoice"');
    expect(stdout.text()).toContain('"backendCapabilities"');
    expect(stdout.text()).toContain('"hodl": false');
  });

  test("validate requires --config when multiple saved configs exist", async () => {
    const dir = await fixtureDir("validate-many");
    await writeFile(join(dir, "one.yaml"), yamlConfig({ name: "one" }));
    await writeFile(join(dir, "two.yaml"), yamlConfig({ name: "two" }));
    const stderr = new CaptureStream();

    const code = await runCli({
      argv: ["validate"],
      stderr,
      configDir: dir,
      env: { OPENNODE_API_KEY: "test-api-key" },
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain("Multiple saved configs found");
    expect(stderr.text()).toContain("--config <name-or-path>");
  });

  test("validate accepts saved config names", async () => {
    const dir = await fixtureDir("validate-name");
    await writeFile(join(dir, "pokedex.yaml"), yamlConfig());
    const stdout = new CaptureStream();

    const code = await runCli({
      argv: ["validate", "--config", "pokedex"],
      stdout,
      configDir: dir,
      env: { OPENNODE_API_KEY: "test-api-key" },
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain('"name": "pokedex"');
  });

  test("validate accepts config paths", async () => {
    const dir = await fixtureDir("validate-path");
    const configPath = join(dir, "boltwall.yaml");
    await writeFile(configPath, yamlConfig());
    const stdout = new CaptureStream();

    const code = await runCli({
      argv: ["validate", "--config", configPath],
      stdout,
      configDir: dir,
      env: { OPENNODE_API_KEY: "test-api-key" },
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain('"backend": "opennode"');
    expect(stdout.text()).toContain('"backendCapabilities"');
  });

  test("validate fails on backend capability mismatch", async () => {
    const dir = await fixtureDir("hodl-mismatch");
    const configPath = join(dir, "boltwall.yaml");
    await writeFile(configPath, yamlConfig({ requireHodl: true }));
    const stderr = new CaptureStream();

    const code = await runCli({
      argv: ["validate", "--config", configPath],
      stderr,
      env: { OPENNODE_API_KEY: "test-api-key" },
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain("does not support HODL invoices");
  });

  test("dev validates CLI flags before starting a server", async () => {
    const dir = await fixtureDir("dev");
    const configPath = join(dir, "boltwall.yaml");
    await writeFile(configPath, yamlConfig());
    const stderr = new CaptureStream();

    const code = await runCli({
      argv: ["dev", "--config", configPath, "--port", "0"],
      stderr,
      env: { OPENNODE_API_KEY: "test-api-key" },
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain("--port must be a positive integer");
  });

  test("dev creates a saved config interactively when none exists", async () => {
    const dir = await fixtureDir("dev-interactive");
    const stdout = new CaptureStream();
    const prompt = new ScriptedPrompt({
      input: [
        "local-pokedex",
        "",
        "https://pokeapi.co/api/v2",
        "pokedex",
        "1000",
        "/pokemon/*",
        "1000",
        "/healthz",
      ],
      select: ["opennode"],
      confirm: [true],
      secret: [],
    });

    const code = await runCli({
      argv: ["dev", "--port", "4010"],
      stdout,
      configDir: dir,
      env: { OPENNODE_API_KEY: "test-api-key" },
      prompt,
      startServer: false,
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain(
      "No saved Boltwall config found. Creating a local proxy config now.",
    );
    expect(stdout.text()).toContain("Saved config:");
    expect(stdout.text()).toContain("boltwall proxy validated for http://127.0.0.1:4010");
  });

  test("deploy --config --yes validates before setting Vercel env vars", async () => {
    const dir = await fixtureDir("deploy-missing-env");
    const configPath = join(dir, "boltwall.yaml");
    await writeFile(configPath, yamlConfig());
    const runner = new MockRunner();
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();

    const code = await runCli({
      argv: ["deploy", "--config", configPath, "--yes"],
      stdout,
      stderr,
      configDir: dir,
      env: {},
      runner,
      prompt: new FailingPrompt(),
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain("unexpected prompt");
    expect(runner.commands).toHaveLength(0);
  });

  test("deploy --config --yes sets Vercel env vars and deploys without final confirmation", async () => {
    const dir = await fixtureDir("deploy");
    const configPath = join(dir, "boltwall.yaml");
    await writeFile(configPath, yamlConfig());
    const stdout = new CaptureStream();
    const runner = new MockRunner();

    const code = await runCli({
      argv: ["deploy", "--config", configPath, "--yes"],
      stdout,
      configDir: dir,
      env: { OPENNODE_API_KEY: "test-api-key" },
      runner,
      prompt: new FailingPrompt(),
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain("Deployment URL: https://boltwall-preview.vercel.app");
    expect(runner.commands.map((command) => command.args.join(" "))).toContain(
      "env add OPENNODE_API_KEY preview --force --cwd " +
        join(dir, "deployments", "pokedex") +
        " --sensitive",
    );
    expect(runner.commands.at(-1)?.args).toEqual([
      "deploy",
      "--cwd",
      join(dir, "deployments", "pokedex"),
      "--yes",
    ]);
  });

  test("deploy maps custom secret env names to canonical Vercel names", async () => {
    const dir = await fixtureDir("deploy-custom-env");
    const configPath = join(dir, "boltwall.yaml");
    await writeFile(
      configPath,
      [
        "name: custom-env",
        "targetUrl: https://pokeapi.co/api/v2",
        "backend:",
        "  kind: opennode",
        "  env:",
        "    apiKey: MY_OPENNODE_SECRET",
        "pricing:",
        '  defaultPriceMsat: "1000"',
      ].join("\n"),
    );
    const runner = new MockRunner();
    const stdout = new CaptureStream();

    const code = await runCli({
      argv: ["deploy", "--config", configPath, "--yes"],
      stdout,
      configDir: dir,
      env: { MY_OPENNODE_SECRET: "custom-secret-value" },
      runner,
      prompt: new FailingPrompt(),
    });

    expect(code).toBe(0);
    expect(runner.commands).toContainEqual({
      command: "vercel",
      args: [
        "env",
        "add",
        "OPENNODE_API_KEY",
        "preview",
        "--force",
        "--cwd",
        join(dir, "deployments", "custom-env"),
        "--sensitive",
      ],
      stdin: "custom-secret-value\n",
    });
  });

  test("deploy interactive creates config and collects missing secrets", async () => {
    const dir = await fixtureDir("interactive");
    const stdout = new CaptureStream();
    const runner = new MockRunner();
    const prompt = new ScriptedPrompt({
      input: [
        "pokedex",
        "https://pokeapi.co/api/v2",
        "",
        "1000",
        "/pokemon/*",
        "1000",
        "/healthz",
        "boltwall-pokedex",
      ],
      select: ["opennode"],
      confirm: [false, true],
      secret: ["interactive-api-key"],
    });

    const code = await runCli({
      argv: ["deploy"],
      stdout,
      configDir: dir,
      env: {},
      runner,
      prompt,
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain("Saved config:");
    expect(runner.commands.some((command) => command.stdin === "interactive-api-key\n")).toBe(true);
  });

  test("config show prints path and redacted summary", async () => {
    const dir = await fixtureDir("show");
    await writeFile(join(dir, "pokedex.yaml"), yamlConfig());
    const stdout = new CaptureStream();

    const code = await runCli({
      argv: ["config", "show", "pokedex"],
      stdout,
      configDir: dir,
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain("Path:");
    expect(stdout.text()).toContain('"targetUrl": "https://pokeapi.co/api/v2"');
    expect(stdout.text()).toContain('"apiKey"');
    expect(stdout.text()).toContain('"env": "OPENNODE_API_KEY"');
  });
});

class CaptureStream extends Writable {
  #chunks: string[] = [];

  override _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.#chunks.push(chunk.toString());
    callback();
  }

  text(): string {
    return this.#chunks.join("");
  }
}

class MockRunner implements CommandRunner {
  readonly commands: { command: string; args: string[]; stdin?: string }[] = [];

  async run(command: string, args: string[], options?: { stdin?: string }): Promise<CommandResult> {
    this.commands.push({
      command,
      args,
      ...(options?.stdin === undefined ? {} : { stdin: options.stdin }),
    });
    return {
      code: 0,
      stdout: args[0] === "deploy" ? "https://boltwall-preview.vercel.app\n" : "",
      stderr: "",
    };
  }
}

class FailingPrompt implements PromptDriver {
  async input(): Promise<string> {
    throw new Error("unexpected prompt");
  }
  async secret(): Promise<string> {
    throw new Error("unexpected prompt");
  }
  async confirm(): Promise<boolean> {
    throw new Error("unexpected prompt");
  }
  async select(): Promise<string> {
    throw new Error("unexpected prompt");
  }
}

class ScriptedPrompt implements PromptDriver {
  constructor(
    private readonly answers: {
      input: string[];
      secret: string[];
      confirm: boolean[];
      select: string[];
    },
  ) {}

  async input(_message: string, defaultValue?: string): Promise<string> {
    const answer = this.answers.input.shift();
    return answer === "" || answer === undefined ? (defaultValue ?? "") : answer;
  }

  async secret(): Promise<string> {
    return this.answers.secret.shift() ?? "";
  }

  async confirm(): Promise<boolean> {
    return this.answers.confirm.shift() ?? false;
  }

  async select(_message: string, _choices: string[], defaultValue?: string): Promise<string> {
    return this.answers.select.shift() ?? defaultValue ?? "";
  }
}

function yamlConfig(options: { name?: string; requireHodl?: boolean } = {}): string {
  return [
    `name: ${options.name ?? "pokedex"}`,
    "targetUrl: https://pokeapi.co/api/v2",
    "backend:",
    "  kind: opennode",
    "pricing:",
    '  defaultPriceMsat: "1000"',
    "routes:",
    "  - path: /pokemon/*",
    "    methods: [GET]",
    '    priceMsat: "1000"',
    ...(options.requireHodl === true ? ["    requires:", "      hodl: true"] : []),
    "cors:",
    "  allowOrigins:",
    "    - http://127.0.0.1:3000",
    "    - https://boltwall-suite-playground.vercel.app",
    "  allowMethods: [GET, OPTIONS]",
    "  allowHeaders: [Authorization, Content-Type]",
    "  maxAgeSeconds: 600",
  ].join("\n");
}

async function fixtureDir(label: string): Promise<string> {
  const dir = join(
    tmpdir(),
    `boltwall-cli-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  return dir;
}

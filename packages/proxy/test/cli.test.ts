import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import { describe, expect, test } from "bun:test";

import { runCli, type PromptDriver } from "../src/cli";
import type { CommandResult, CommandRunner } from "../src/deploy/vercel";

describe("boltwall CLI", () => {
  test("prints help", async () => {
    const stdout = new CaptureStream();
    await expect(runCli({ argv: ["--help"], stdout })).resolves.toBe(0);
    expect(stdout.text()).toContain("deploy vercel");
  });

  test("validate reports missing config paths", async () => {
    const stderr = new CaptureStream();
    const code = await runCli({
      argv: ["validate", "--config", "/private/tmp/no-such-boltwall-config.yaml"],
      stderr,
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain("Config not found");
  });

  test("validate prints config and backend capability summaries", async () => {
    const dir = await fixtureDir("validate");
    const configPath = join(dir, "boltwall.yaml");
    await writeFile(configPath, yamlConfig());
    const stdout = new CaptureStream();

    const code = await runCli({
      argv: ["validate", "--config", configPath],
      stdout,
      env: { OPENNODE_API_KEY: "test-api-key" },
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain('"backend": "opennode"');
    expect(stdout.text()).toContain('"hodl": false');
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

  test("deploy vercel --config --yes sets Vercel env vars and deploys without prompts", async () => {
    const dir = await fixtureDir("deploy");
    const configPath = join(dir, "boltwall.yaml");
    await writeFile(configPath, yamlConfig());
    const stdout = new CaptureStream();
    const runner = new MockRunner();

    const code = await runCli({
      argv: ["deploy", "vercel", "--config", configPath, "--yes"],
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

  test("deploy vercel maps custom secret env names to canonical Vercel names", async () => {
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
      argv: ["deploy", "vercel", "--config", configPath, "--yes"],
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

  test("deploy vercel interactive creates config and collects missing secrets", async () => {
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
      confirm: [false],
      secret: ["interactive-api-key"],
    });

    const code = await runCli({
      argv: ["deploy", "vercel"],
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
    return this.answers.input.shift() ?? defaultValue ?? "";
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

function yamlConfig(options: { requireHodl?: boolean } = {}): string {
  return [
    "name: pokedex",
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

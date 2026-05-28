import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";

import { describe, expect, test } from "bun:test";

import { ReadlinePrompt, runCli, type PromptDriver } from "../src/cli";
import type { CommandResult, CommandRunner } from "../src/deploy/vercel";

describe("boltwall CLI", () => {
  test("prints compact help", async () => {
    const stdout = new CaptureStream();
    await expect(runCli({ argv: ["--help"], stdout })).resolves.toBe(0);
    expect(stdout.text()).toContain("deploy [--config <name-or-path>]");
    expect(stdout.text()).not.toContain("deploy vercel");
    expect(stdout.text()).toContain("config allow-origin <name-or-path> <origin...>");
  });

  test("readline select renders a choice prompt with a default marker", async () => {
    const stdout = new CaptureStream();
    const prompt = new ReadlinePrompt(Readable.from(["2\n"]), stdout);

    await expect(
      prompt.select("Lightning backend", ["voltage-lnd", "lnd", "opennode"], "lnd"),
    ).resolves.toBe("lnd");

    expect(stdout.text()).toContain("Lightning backend:");
    expect(stdout.text()).toContain("  1. voltage-lnd");
    expect(stdout.text()).toContain("  2. lnd (default)");
    expect(stdout.text()).toContain("Choose lightning backend [lnd]:");
  });

  test("readline secret prompts do not echo secret values", async () => {
    const stdout = new CaptureStream();
    const prompt = new ReadlinePrompt(Readable.from(["secret-api-key\n"]), stdout);

    await expect(prompt.secret("OPENNODE_API_KEY")).resolves.toBe("secret-api-key");
    expect(stdout.text()).toContain("OPENNODE_API_KEY");
    expect(stdout.text()).toContain("Input is hidden");
    expect(stdout.text()).not.toContain("secret-api-key");
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
    expect(stdout.text()).toContain('"allowOrigins"');
    expect(stdout.text()).toContain('"http://127.0.0.1:3000"');
    expect(stdout.text()).toContain('"https://boltwall-suite-playground.vercel.app"');
    expect(stdout.text()).not.toContain('"configuredRequirements"');
    expect(stdout.text()).not.toContain('"hodl"');
    expect(stdout.text()).not.toContain('"backendCapabilities"');
    expect(stdout.text()).not.toContain('"deployTarget"');
    expect(stdout.text()).not.toContain('"deployProjectName"');
  });

  test("validate hides LND capabilities from the happy path", async () => {
    const dir = await fixtureDir("validate-lnd-summary");
    await writeFile(
      join(dir, "local-dev.yaml"),
      [
        "name: local-dev",
        "targetUrl: https://pokeapi.co/api/v2",
        "backend:",
        "  kind: lnd",
        "pricing:",
        '  defaultPriceMsat: "1000"',
        "routes:",
        "  - path: /pokemon/*",
        "    methods: [GET]",
        '    priceMsat: "1000"',
      ].join("\n"),
    );
    const stdout = new CaptureStream();

    const code = await runCli({
      argv: ["validate", "--config", "local-dev"],
      stdout,
      configDir: dir,
      env: {
        LND_SOCKET: "localhost:10009",
        LND_TLS_CERT: "cert",
        LND_MACAROON: "macaroon",
      },
    });

    expect(code).toBe(0);
    const output = JSON.parse(stdout.text()) as {
      config: { paywallMode: string };
    };
    expect(output.config.paywallMode).toBe("standard-invoice");
    expect(stdout.text()).not.toContain("configuredRequirements");
    expect(stdout.text()).not.toContain("backendCapabilities");
    expect(stdout.text()).not.toContain('"hodl"');
  });

  test("config show labels required env separately from backend capabilities", async () => {
    const dir = await fixtureDir("show-env-labels");
    await writeFile(join(dir, "pokedex.yaml"), yamlConfig());
    const stdout = new CaptureStream();

    const code = await runCli({
      argv: ["config", "show", "pokedex"],
      stdout,
      configDir: dir,
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain('"requiredEnv"');
    expect(stdout.text()).toContain('"allowOrigins"');
    expect(stdout.text()).toContain('"https://boltwall-suite-playground.vercel.app"');
    expect(stdout.text()).not.toContain('"backendCapabilities"');
  });

  test("config show and validate surface configured paywall policy", async () => {
    const dir = await fixtureDir("policy-summary");
    await writeFile(join(dir, "pokedex.yaml"), yamlConfig({ policy: true }));
    const stdout = new CaptureStream();

    const code = await runCli({
      argv: ["validate", "--config", "pokedex"],
      stdout,
      configDir: dir,
      env: { OPENNODE_API_KEY: "test-api-key" },
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain('"policy"');
    expect(stdout.text()).toContain('"validUntilSeconds": 60');
    expect(stdout.text()).toContain('"origin"');
    expect(stdout.text()).toContain('"https://boltwall-suite-playground.vercel.app"');
    expect(stdout.text()).toContain('"capabilities"');
    expect(stdout.text()).toContain('"pokedex-read"');
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
    expect(stdout.text()).not.toContain('"backendCapabilities"');
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
        "1000",
        "/pokemon/*",
        "1000",
        "/healthz",
      ],
      select: ["opennode"],
      confirm: [true, false],
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
    const saved = await readFile(join(dir, "local-pokedex.yaml"), "utf8");
    expect(saved).toContain("http://127.0.0.1:3000");
    expect(saved).toContain("http://localhost:3000");
    expect(saved).toContain("apiKey: OPENNODE_API_KEY");
    expect(saved).toContain("baseUrl: OPENNODE_BASE_URL");
    expect(saved).not.toContain("service:");
    expect(saved).not.toContain("deploy:");
    expect(saved).not.toContain("UNUSED_");
    expect(saved).not.toContain("socket:");
    expect(saved).not.toContain("macaroon:");
  });

  test("interactive config creation defaults to LND backend", async () => {
    const dir = await fixtureDir("create-default-lnd");
    const prompt = new ScriptedPrompt({
      input: ["local-dev", "https://pokeapi.co/api/v2", "1000", "/pokemon/*", "1000", "/healthz"],
      select: [],
      confirm: [false, false],
      secret: [],
    });

    const code = await runCli({
      argv: ["config", "create"],
      configDir: dir,
      prompt,
    });

    expect(code).toBe(0);
    const saved = await readFile(join(dir, "local-dev.yaml"), "utf8");
    expect(saved).toContain("kind: lnd");
    expect(saved).toContain("socket: LND_SOCKET");
    expect(saved).toContain("cert: LND_TLS_CERT");
    expect(saved).toContain("macaroon: LND_MACAROON");
    expect(saved).not.toContain("service:");
    expect(saved).not.toContain("deploy:");
    expect(saved).not.toContain("UNUSED_");
  });

  test("interactive config creation can enable origin caveat and HODL mode", async () => {
    const dir = await fixtureDir("create-advanced-policy");
    const prompt = new ScriptedPrompt({
      input: [
        "hodl-dev",
        "https://pokeapi.co/api/v2",
        "1000",
        "/pokemon/*",
        "1000",
        "/healthz",
        "120",
        "https://app.example",
        "pokedex",
        "pokedex-read",
      ],
      select: [],
      confirm: [false, true, true, true],
      secret: [],
    });

    const code = await runCli({
      argv: ["config", "create"],
      configDir: dir,
      prompt,
    });

    expect(code).toBe(0);
    const saved = await readFile(join(dir, "hodl-dev.yaml"), "utf8");
    expect(saved).toContain("service: pokedex");
    expect(saved).toContain("policy:");
    expect(saved).toContain("validUntilSeconds: 120");
    expect(saved).toContain("origin:");
    expect(saved).toContain("https://app.example");
    expect(saved).toContain("capabilities:");
    expect(saved).toContain("pokedex-read");
    expect(saved).toContain("hodl: true");
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
    expect(runner.commands.map((command) => command.args)).toEqual([["--version"], ["whoami"]]);
  });

  test("deploy checks Vercel CLI before config prompts", async () => {
    const runner = new MockRunner({
      "--version": {
        code: 1,
        stdout: "",
        stderr: "command not found: vercel",
      },
    });
    const stderr = new CaptureStream();

    const code = await runCli({
      argv: ["deploy"],
      stderr,
      runner,
      prompt: new FailingPrompt(),
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain("Vercel CLI is required before running boltwall deploy");
    expect(runner.commands.map((command) => command.args)).toEqual([["--version"]]);
  });

  test("deploy checks Vercel authentication before config prompts", async () => {
    const runner = new MockRunner({
      whoami: {
        code: 1,
        stdout: "",
        stderr: "Error: No existing credentials found. Please run `vercel login`",
      },
    });
    const stderr = new CaptureStream();

    const code = await runCli({
      argv: ["deploy"],
      stderr,
      runner,
      prompt: new FailingPrompt(),
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain(
      "Vercel CLI must be authenticated before running boltwall deploy",
    );
    expect(stderr.text()).toContain("vercel login");
    expect(runner.commands.map((command) => command.args)).toEqual([["--version"], ["whoami"]]);
  });

  test("deploy rejects blank secret prompt values before writing Vercel env vars", async () => {
    const dir = await fixtureDir("deploy-blank-secret");
    const configPath = join(dir, "boltwall.yaml");
    await writeFile(configPath, yamlConfig());
    const stderr = new CaptureStream();
    const runner = new MockRunner();

    const code = await runCli({
      argv: ["deploy", "--config", configPath, "--yes"],
      stderr,
      configDir: dir,
      env: {},
      runner,
      prompt: new ScriptedPrompt({
        input: [],
        secret: [""],
        confirm: [],
        select: [],
      }),
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain("OPENNODE_API_KEY is required");
    expect(runner.commands.map((command) => command.args)).toEqual([["--version"], ["whoami"]]);
  });

  test("deploy --config --yes sets Vercel env vars and deploys without final confirmation", async () => {
    const dir = await fixtureDir("deploy");
    const configPath = join(dir, "boltwall.yaml");
    await writeFile(configPath, yamlConfig({ policy: true }));
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
    expect(runner.commands).toContainEqual({
      command: "vercel",
      args: [
        "env",
        "add",
        "POLICY_VALID_UNTIL_SECONDS",
        "preview",
        "--force",
        "--cwd",
        join(dir, "deployments", "pokedex"),
      ],
      stdin: "60\n",
    });
    expect(runner.commands).toContainEqual({
      command: "vercel",
      args: [
        "env",
        "add",
        "CAPABILITIES",
        "preview",
        "--force",
        "--cwd",
        join(dir, "deployments", "pokedex"),
      ],
      stdin: "pokedex-read\n",
    });
    expect(runner.commands).toContainEqual({
      command: "vercel",
      args: [
        "env",
        "add",
        "POLICY_ORIGIN",
        "preview",
        "--force",
        "--cwd",
        join(dir, "deployments", "pokedex"),
      ],
      stdin: "https://boltwall-suite-playground.vercel.app\n",
    });
    expect(runner.commands.at(-1)?.args).toEqual([
      "deploy",
      "--cwd",
      join(dir, "deployments", "pokedex"),
      "--yes",
    ]);
  });

  test("deploy --config --yes does not prompt when Vercel project name exists", async () => {
    const dir = await fixtureDir("deploy-existing-project");
    const configPath = join(dir, "boltwall.yaml");
    await writeFile(configPath, yamlConfig({ deployProjectName: "existing-proxy" }));
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

  test("deploy maps HODL paywall mode to Vercel runtime env", async () => {
    const dir = await fixtureDir("deploy-hodl");
    const configPath = join(dir, "boltwall.yaml");
    await writeFile(
      configPath,
      [
        "name: hodl-proxy",
        "targetUrl: https://pokeapi.co/api/v2",
        "backend:",
        "  kind: lnd",
        "pricing:",
        '  defaultPriceMsat: "1000"',
        "policy:",
        "  hodl: true",
      ].join("\n"),
    );
    const runner = new MockRunner();

    const code = await runCli({
      argv: ["deploy", "--config", configPath, "--yes"],
      configDir: dir,
      env: {
        LND_SOCKET: "localhost:10009",
        LND_TLS_CERT: "cert",
        LND_MACAROON: "macaroon",
      },
      runner,
      prompt: new FailingPrompt(),
    });

    expect(code).toBe(0);
    expect(runner.commands).toContainEqual({
      command: "vercel",
      args: [
        "env",
        "add",
        "PAYWALL_HODL",
        "preview",
        "--force",
        "--cwd",
        join(dir, "deployments", "hodl-proxy"),
      ],
      stdin: "true\n",
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
        "1000",
        "/pokemon/*",
        "1000",
        "/healthz",
        "boltwall-pokedex",
      ],
      select: ["opennode"],
      confirm: [false, false, true],
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
    expect(stdout.text()).toContain('"allowOrigins"');
    expect(stdout.text()).toContain('"apiKey"');
    expect(stdout.text()).toContain('"env": "OPENNODE_API_KEY"');
  });

  test("config allow-origin updates a saved config without hand-editing YAML", async () => {
    const dir = await fixtureDir("allow-origin");
    await writeFile(join(dir, "pokedex.yaml"), yamlConfig());
    const stdout = new CaptureStream();

    const code = await runCli({
      argv: ["config", "allow-origin", "pokedex", "http://localhost:3001"],
      stdout,
      configDir: dir,
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain("Saved config:");
    expect(stdout.text()).toContain('"http://localhost:3001"');
    const saved = await readFile(join(dir, "pokedex.yaml"), "utf8");
    expect(saved).toContain("http://127.0.0.1:3000");
    expect(saved).toContain("http://localhost:3001");
  });

  test("config allow-origin creates CORS config when one is not present", async () => {
    const dir = await fixtureDir("allow-origin-create-cors");
    await writeFile(
      join(dir, "local-dev.yaml"),
      [
        "name: local-dev",
        "targetUrl: https://pokeapi.co/api/v2",
        "backend:",
        "  kind: lnd",
        "pricing:",
        '  defaultPriceMsat: "1000"',
      ].join("\n"),
    );
    const stdout = new CaptureStream();

    const code = await runCli({
      argv: ["config", "allow-origin", "local-dev", "http://localhost:3001"],
      stdout,
      configDir: dir,
    });

    expect(code).toBe(0);
    const saved = await readFile(join(dir, "local-dev.yaml"), "utf8");
    expect(saved).toContain("cors:");
    expect(saved).toContain("http://localhost:3001");
    expect(saved).toContain("WWW-Authenticate");
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

  constructor(private readonly responses: Record<string, CommandResult> = {}) {}

  async run(command: string, args: string[], options?: { stdin?: string }): Promise<CommandResult> {
    this.commands.push({
      command,
      args,
      ...(options?.stdin === undefined ? {} : { stdin: options.stdin }),
    });
    const response = this.responses[args.join(" ")] ?? this.responses[args[0] ?? ""];
    if (response !== undefined) return response;
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

function yamlConfig(
  options: {
    name?: string;
    policy?: boolean;
    requireHodl?: boolean;
    deployProjectName?: string;
  } = {},
): string {
  return [
    `name: ${options.name ?? "pokedex"}`,
    "targetUrl: https://pokeapi.co/api/v2",
    "backend:",
    "  kind: opennode",
    ...(options.policy === true ? ["service: pokedex"] : []),
    "pricing:",
    '  defaultPriceMsat: "1000"',
    ...(options.policy === true
      ? [
          "policy:",
          "  validUntilSeconds: 60",
          "  origin:",
          "    - https://boltwall-suite-playground.vercel.app",
          "  capabilities: [pokedex-read]",
        ]
      : []),
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
    ...(options.deployProjectName === undefined
      ? []
      : ["deploy:", "  target: vercel", `  projectName: ${options.deployProjectName}`]),
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

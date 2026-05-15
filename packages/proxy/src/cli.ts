#!/usr/bin/env node

import { stdin as defaultStdin, stdout as defaultStdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { loadBoltwallConfig } from "./config-loader.js";
import {
  backendEnvNames,
  configSummary,
  createBackendFromEnv,
  parseBoltwallConfig,
  requiredSecretEnvNames,
  toProxyConfig,
  validateBackendCapabilities,
  type BoltwallBackendKind,
  type BoltwallConfig,
  type BoltwallConfigInput,
} from "./config-schema.js";
import {
  configPathForName,
  listSavedConfigs,
  saveConfig,
  type SavedBoltwallConfig,
} from "./config-store.js";
import { deployVercel, type CommandRunner } from "./deploy/vercel.js";

import { createProxy } from "./index.js";

const usage = `boltwall <command>

Commands:
  deploy vercel              Configure and deploy the Vercel proxy
  dev --config <path>        Start the local proxy runtime
  validate --config <path>   Validate proxy configuration
  config list                List saved configs
  config show <name>         Show a saved config path
  --help                     Show this help
`;

export interface CliOptions {
  argv?: string[];
  env?: Record<string, string | undefined>;
  stdin?: Readable;
  stdout?: Writable;
  stderr?: Writable;
  configDir?: string;
  runner?: CommandRunner;
  prompt?: PromptDriver;
}

export interface PromptDriver {
  input(message: string, defaultValue?: string): Promise<string>;
  secret(message: string): Promise<string>;
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;
  select(message: string, choices: string[], defaultValue?: string): Promise<string>;
}

export async function runCli(options: CliOptions = {}): Promise<number> {
  const argv = options.argv ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const env = options.env ?? process.env;
  const prompt =
    options.prompt ??
    new ReadlinePrompt(options.stdin ?? defaultStdin, options.stdout ?? defaultStdout);

  try {
    const [command, subcommand, ...rest] = argv;

    if (command === undefined || command === "--help" || command === "-h") {
      write(stdout, usage);
      return 0;
    }

    if (command === "deploy" && subcommand === "vercel") {
      return await deployVercelCommand(rest, { ...options, env, stdout, prompt });
    }

    if (command === "validate") {
      return await validateCommand([subcommand, ...rest].filter(isDefined), {
        stdout,
        env,
        prompt,
        ...(options.configDir === undefined ? {} : { configDir: options.configDir }),
      });
    }

    if (command === "dev") {
      return await devCommand([subcommand, ...rest].filter(isDefined), {
        stdout,
        env,
        prompt,
        ...(options.configDir === undefined ? {} : { configDir: options.configDir }),
      });
    }

    if (command === "config" && subcommand === "list") {
      const saved = await listSavedConfigs(options.configDir);
      for (const config of saved) write(stdout, `${config.name}\t${config.path}\n`);
      return 0;
    }

    if (command === "config" && subcommand === "show") {
      const name = rest[0];
      if (name === undefined) throw new Error("config show requires a config name");
      const saved = await findSavedConfigOrThrow(name, options.configDir);
      write(stdout, `${saved.path}\n`);
      return 0;
    }

    write(stderr, usage);
    return 1;
  } catch (error) {
    write(stderr, `${formatCliError(error)}\n`);
    return 1;
  }
}

async function deployVercelCommand(
  argv: string[],
  options: Required<Pick<CliOptions, "env" | "stdout" | "prompt">> &
    Pick<CliOptions, "configDir" | "runner">,
): Promise<number> {
  const flags = parseFlags(argv);
  const yes = flags.boolean.has("yes");
  const loadedConfig =
    flags.values.config === undefined
      ? await chooseOrCreateConfig(options.prompt, options.configDir, options.stdout)
      : await loadBoltwallConfig(flags.values.config);
  const config =
    flags.boolean.has("prod") || flags.boolean.has("production")
      ? { ...loadedConfig, deploy: { ...loadedConfig.deploy, production: true } }
      : loadedConfig;

  const secretValues = yes ? {} : await promptForSecrets(config, options.prompt, options.env);
  const result = await deployVercel({
    config,
    env: options.env,
    secretValues,
    ...(options.configDir === undefined ? {} : { configDir: options.configDir }),
    ...(options.runner === undefined ? {} : { runner: options.runner }),
  });

  write(options.stdout, `Deployment URL: ${result.deploymentUrl}\n`);
  write(options.stdout, `Environment: ${result.environment}\n`);
  write(options.stdout, `Project directory: ${result.projectDir}\n`);
  return 0;
}

async function validateCommand(
  argv: string[],
  options: {
    configDir?: string;
    stdout: Writable;
    env: Record<string, string | undefined>;
    prompt: PromptDriver;
  },
): Promise<number> {
  const config = await loadConfigFromFlags(argv, options);
  const backend = createBackendFromEnv(config, options.env);
  validateBackendCapabilities(config, backend);
  write(options.stdout, `${JSON.stringify(configSummary(config), null, 2)}\n`);
  write(options.stdout, `${JSON.stringify(backend.capabilities, null, 2)}\n`);
  return 0;
}

async function devCommand(
  argv: string[],
  options: {
    configDir?: string;
    stdout: Writable;
    env: Record<string, string | undefined>;
    prompt: PromptDriver;
  },
): Promise<number> {
  const flags = parseFlags(argv);
  const port = flags.values.port === undefined ? 3000 : Number(flags.values.port);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("--port must be a positive integer");
  }

  const config = await loadConfigFromFlags(argv, options);
  const backend = createBackendFromEnv(config, options.env);
  validateBackendCapabilities(config, backend);
  const app = createProxy(toProxyConfig(config, backend));
  app.listen(port, () => {
    write(options.stdout, `boltwall proxy listening on http://127.0.0.1:${port}\n`);
  });
  return 0;
}

async function loadConfigFromFlags(
  argv: string[],
  options: {
    configDir?: string;
    prompt: PromptDriver;
  },
): Promise<BoltwallConfig> {
  const flags = parseFlags(argv);
  if (flags.values.config !== undefined) return await loadBoltwallConfig(flags.values.config);

  const saved = await listSavedConfigs(options.configDir);
  if (saved.length === 0) {
    throw new Error("No saved configs found. Run `boltwall deploy vercel` or pass --config.");
  }
  if (saved.length === 1) return await loadBoltwallConfig(saved[0]!.path);

  const selected = await options.prompt.select(
    "Select a saved config",
    saved.map((config) => config.name),
    saved[0]?.name,
  );
  return await loadBoltwallConfig((await findSavedConfigOrThrow(selected, options.configDir)).path);
}

async function chooseOrCreateConfig(
  prompt: PromptDriver,
  configDir?: string,
  stdout: Writable = defaultStdout,
): Promise<BoltwallConfig> {
  const saved = await listSavedConfigs(configDir);
  if (saved.length === 0) return await promptForConfig(prompt, undefined, configDir, stdout);

  const action = await prompt.select("Config", ["use existing", "edit existing", "create new"]);
  if (action === "create new") return await promptForConfig(prompt, undefined, configDir, stdout);

  const selected = await prompt.select(
    "Saved config",
    saved.map((config) => config.name),
    saved[0]?.name,
  );
  const existing = await loadBoltwallConfig((await findSavedConfigOrThrow(selected, configDir)).path);
  if (action === "use existing") return existing;
  return await promptForConfig(prompt, existing, configDir, stdout);
}

async function promptForConfig(
  prompt: PromptDriver,
  existing: BoltwallConfig | undefined,
  configDir?: string,
  stdout: Writable = defaultStdout,
): Promise<BoltwallConfig> {
  const name = await prompt.input("Config name", existing?.name ?? "default");
  const backendKind = (await prompt.select(
    "Lightning backend",
    ["voltage-lnd", "lnd", "opennode", "btcpay"],
    existing?.backend.kind ?? "voltage-lnd",
  )) as BoltwallBackendKind;
  const defaultNames = backendEnvNames(backendKind);
  const input: BoltwallConfigInput = {
    name,
    targetUrl: await prompt.input("Upstream target URL", existing?.targetUrl ?? ""),
    service: optionalInput(await prompt.input("Service name", existing?.service ?? "")),
    backend: {
      kind: backendKind,
      env: defaultNames,
    },
    pricing: {
      defaultPriceMsat: await prompt.input(
        "Default price in millisatoshis",
        existing?.pricing.defaultPriceMsat ?? "1000",
      ),
    },
    routes: [
      {
        path: await prompt.input("Protected path", existing?.routes?.[0]?.path ?? "/*"),
        methods: ["GET"],
        priceMsat: await prompt.input(
          "Protected path price in millisatoshis",
          existing?.routes?.[0]?.priceMsat ?? existing?.pricing.defaultPriceMsat ?? "1000",
        ),
      },
    ],
    challengeCompatibility: "dual",
    unprotectedPaths: splitList(
      await prompt.input(
        "Unprotected paths (comma separated)",
        existing?.unprotectedPaths?.join(",") ?? "/healthz",
      ),
    ),
    forwardHeaders: {
      allow: ["accept", "content-type", "x-request-id"],
      deny: ["cookie", "authorization"],
    },
    deploy: {
      target: "vercel",
      projectName: await prompt.input("Vercel project name", existing?.deploy.projectName ?? name),
      production: await prompt.confirm("Deploy to production", existing?.deploy.production ?? false),
    },
  };
  const config = parseBoltwallConfig(input);
  const path = await saveConfig(config, configPathForName(config.name ?? "default", configDir));
  write(stdout, `Saved config: ${path}\n`);
  return config;
}

async function promptForSecrets(
  config: BoltwallConfig,
  prompt: PromptDriver,
  env: Record<string, string | undefined>,
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const name of requiredSecretEnvNames(config)) {
    if (env[name] !== undefined && env[name]!.trim() !== "") continue;
    values[name] = await prompt.secret(`${name}`);
  }
  return values;
}

async function findSavedConfigOrThrow(
  name: string,
  configDir?: string,
): Promise<SavedBoltwallConfig> {
  const saved = await listSavedConfigs(configDir);
  const found = saved.find((config) => config.name === name);
  if (found === undefined) throw new Error(`Saved config not found: ${name}`);
  return found;
}

function parseFlags(argv: string[]): { values: Record<string, string>; boolean: Set<string> } {
  const values: Record<string, string> = {};
  const boolean = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (!arg.startsWith("--")) continue;
    const name = arg.slice(2);
    if (name === "yes" || name === "prod" || name === "production") {
      boolean.add(name);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    values[name] = value;
    index += 1;
  }
  return { values, boolean };
}

function splitList(value: string): string[] | undefined {
  const values = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return values.length === 0 ? undefined : values;
}

function optionalInput(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function write(stream: Writable, value: string): void {
  stream.write(value);
}

function formatCliError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDefined(value: string | undefined): value is string {
  return value !== undefined;
}

class ReadlinePrompt implements PromptDriver {
  constructor(
    private readonly inputStream: Readable,
    private readonly outputStream: Writable,
  ) {}

  async input(message: string, defaultValue?: string): Promise<string> {
    const rl = createInterface({ input: this.inputStream, output: this.outputStream });
    try {
      const suffix = defaultValue === undefined || defaultValue === "" ? "" : ` (${defaultValue})`;
      const answer = await rl.question(`${message}${suffix}: `);
      return answer.trim() === "" && defaultValue !== undefined ? defaultValue : answer.trim();
    } finally {
      rl.close();
    }
  }

  async secret(message: string): Promise<string> {
    return await this.input(`${message} (not saved to config)`);
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const suffix = defaultValue ? "Y/n" : "y/N";
    const answer = (await this.input(`${message} (${suffix})`)).toLowerCase();
    if (answer === "") return defaultValue;
    return answer === "y" || answer === "yes";
  }

  async select(message: string, choices: string[], defaultValue?: string): Promise<string> {
    if (choices.length === 0) throw new Error(`${message}: no choices available`);
    choices.forEach((choice, index) => {
      write(this.outputStream, `${index + 1}. ${choice}\n`);
    });
    const fallback = defaultValue ?? choices[0]!;
    const answer = await this.input(message, fallback);
    const numeric = Number(answer);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= choices.length) {
      return choices[numeric - 1]!;
    }
    if (choices.includes(answer)) return answer;
    throw new Error(`${message}: invalid choice ${answer}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = await runCli();
  process.exitCode = code;
}

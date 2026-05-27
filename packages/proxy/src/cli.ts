#!/usr/bin/env node

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { extname, resolve } from "node:path";
import { stdin as defaultStdin, stdout as defaultStdout } from "node:process";
import { createInterface as createMaskedInterface } from "node:readline";
import { createInterface as createQuestionInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { findSavedConfig, loadBoltwallConfig } from "./config-loader.js";
import {
  backendEnvDescription,
  backendEnvNames,
  configSummary,
  createBackendFromEnv,
  parseBoltwallConfig,
  toProxyConfig,
  validateBackendCapabilities,
  type BoltwallBackendEnvNames,
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
  dev [--config <name-or-path>] [--port <port>]   Start a local proxy
  deploy [--config <name-or-path>] [--prod]       Deploy the proxy to Vercel
  validate [--config <name-or-path>]              Validate proxy configuration
  config create                                   Create a saved config
  config list                                     List saved configs
  config show <name-or-path>                      Show a saved config summary
  config allow-origin <name-or-path> <origin...>  Add browser origins to CORS
  --help                                          Show this help
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
  startServer?: boolean;
}

export interface PromptDriver {
  input(message: string, defaultValue?: string): Promise<string>;
  secret(message: string): Promise<string>;
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;
  select(message: string, choices: string[], defaultValue?: string): Promise<string>;
}

interface LoadedConfig {
  config: BoltwallConfig;
  path: string;
}

type ConfigPromptMode = "create" | "deploy" | "dev";

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

    if (command === "deploy") {
      return await deployCommand([subcommand, ...rest].filter(isDefined), {
        ...options,
        env,
        stdout,
        prompt,
      });
    }

    if (command === "validate") {
      return await validateCommand([subcommand, ...rest].filter(isDefined), {
        stdout,
        env,
        ...(options.configDir === undefined ? {} : { configDir: options.configDir }),
      });
    }

    if (command === "dev") {
      return await devCommand([subcommand, ...rest].filter(isDefined), {
        stdout,
        env,
        prompt,
        startServer: options.startServer ?? true,
        ...(options.configDir === undefined ? {} : { configDir: options.configDir }),
      });
    }

    if (command === "config") {
      return await configCommand([subcommand, ...rest].filter(isDefined), {
        stdout,
        env,
        prompt,
        ...(options.configDir === undefined ? {} : { configDir: options.configDir }),
      });
    }

    write(stderr, usage);
    return 1;
  } catch (error) {
    write(stderr, `${formatCliError(error)}\n`);
    return 1;
  }
}

async function deployCommand(
  argv: string[],
  options: Required<Pick<CliOptions, "env" | "stdout" | "prompt">> &
    Pick<CliOptions, "configDir" | "runner">,
): Promise<number> {
  const flags = parseFlags(argv);
  if (flags.positionals.includes("vercel")) {
    throw new Error("Use `boltwall deploy`; the Vercel target is selected by the deploy command.");
  }
  if (flags.positionals.length > 0)
    throw new Error(`Unknown deploy argument: ${flags.positionals[0]}`);

  const loaded =
    flags.values.config === undefined
      ? await chooseOrCreateConfig(options.prompt, "deploy", options.configDir, options.stdout)
      : await loadConfigReference(flags.values.config, options.configDir);
  const production = flags.boolean.has("prod") || flags.boolean.has("production");
  const yes = flags.boolean.has("yes");
  const config = await ensureDeployMetadata(loaded, options.prompt, options.stdout, !yes);
  const secretValues = await promptForSecrets(config, options.prompt, options.env);
  const validationEnv = { ...options.env, ...secretValues };
  validateConfig(config, validationEnv);
  writeValidationSummary(options.stdout, config);

  if (!yes) {
    const environment = production ? "production" : "preview";
    const shouldDeploy = await options.prompt.confirm(
      `Deploy ${config.name ?? "proxy"} to Vercel ${environment}`,
      false,
    );
    if (!shouldDeploy) {
      write(options.stdout, "Deployment cancelled.\n");
      return 0;
    }
  }

  const result = await deployVercel({
    config,
    env: options.env,
    production,
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
  },
): Promise<number> {
  const flags = parseFlags(argv);
  if (flags.positionals.length > 0)
    throw new Error(`Unknown validate argument: ${flags.positionals[0]}`);
  const loaded =
    flags.values.config === undefined
      ? await loadSingleSavedConfig(options.configDir)
      : await loadConfigReference(flags.values.config, options.configDir);
  validateConfig(loaded.config, options.env);
  writeValidationSummary(options.stdout, loaded.config);
  return 0;
}

async function devCommand(
  argv: string[],
  options: {
    configDir?: string;
    stdout: Writable;
    env: Record<string, string | undefined>;
    prompt: PromptDriver;
    startServer: boolean;
  },
): Promise<number> {
  const flags = parseFlags(argv);
  if (flags.positionals.length > 0)
    throw new Error(`Unknown dev argument: ${flags.positionals[0]}`);
  const port = flags.values.port === undefined ? 3000 : Number(flags.values.port);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("--port must be a positive integer");
  }

  const loaded =
    flags.values.config === undefined
      ? await chooseDevConfig(options.prompt, options.configDir, options.stdout)
      : await loadConfigReference(flags.values.config, options.configDir);
  const secretValues = await promptForSecrets(loaded.config, options.prompt, options.env);
  const validationEnv = { ...options.env, ...secretValues };
  const backend = validateConfig(loaded.config, validationEnv);
  writeValidationSummary(options.stdout, loaded.config);
  const app = createProxy(toProxyConfig(loaded.config, backend));
  if (!options.startServer) {
    write(options.stdout, `boltwall proxy validated for http://127.0.0.1:${port}\n`);
    return 0;
  }
  app.listen(port, () => {
    write(options.stdout, `boltwall proxy listening on http://127.0.0.1:${port}\n`);
  });
  return 0;
}

async function configCommand(
  argv: string[],
  options: {
    configDir?: string;
    stdout: Writable;
    env: Record<string, string | undefined>;
    prompt: PromptDriver;
  },
): Promise<number> {
  const [subcommand, ...rest] = argv;
  if (subcommand === "list") {
    const saved = await listSavedConfigs(options.configDir);
    for (const config of saved) write(options.stdout, `${config.name}\t${config.path}\n`);
    return 0;
  }

  if (subcommand === "show") {
    const reference = rest[0];
    if (reference === undefined) throw new Error("config show requires a config name or path");
    const loaded = await loadConfigReference(reference, options.configDir);
    write(options.stdout, `Path: ${loaded.path}\n`);
    writeConfigSummary(options.stdout, loaded.config);
    return 0;
  }

  if (subcommand === "allow-origin") {
    const [reference, ...origins] = rest;
    if (reference === undefined)
      throw new Error("config allow-origin requires a config name or path");
    if (origins.length === 0) throw new Error("config allow-origin requires at least one origin");
    const loaded = await loadConfigReference(reference, options.configDir);
    const config = addCorsOrigins(loaded.config, origins);
    await saveConfig(config, loaded.path);
    write(options.stdout, `Saved config: ${loaded.path}\n`);
    writeConfigSummary(options.stdout, config);
    return 0;
  }

  if (subcommand === "create") {
    await promptForConfig(options.prompt, undefined, "create", options.configDir, options.stdout);
    return 0;
  }

  throw new Error("config requires one of: create, list, show");
}

async function chooseDevConfig(
  prompt: PromptDriver,
  configDir: string | undefined,
  stdout: Writable,
): Promise<LoadedConfig> {
  const saved = await listSavedConfigs(configDir);
  if (saved.length === 0) {
    write(stdout, "No saved Boltwall config found. Creating a local proxy config now.\n");
    return await promptForConfig(prompt, undefined, "dev", configDir, stdout);
  }
  if (saved.length === 1) {
    write(stdout, `Using saved config: ${saved[0]!.name} (${saved[0]!.path})\n`);
    return {
      path: saved[0]!.path,
      config: await loadBoltwallConfig(saved[0]!.path),
    };
  }
  return await chooseOrCreateConfig(prompt, "dev", configDir, stdout);
}

async function chooseOrCreateConfig(
  prompt: PromptDriver,
  mode: ConfigPromptMode,
  configDir?: string,
  stdout: Writable = defaultStdout,
): Promise<LoadedConfig> {
  const saved = await listSavedConfigs(configDir);
  if (saved.length === 0) {
    write(stdout, "No saved Boltwall config found. Creating a proxy config now.\n");
    return await promptForConfig(prompt, undefined, mode, configDir, stdout);
  }

  const action = await prompt.select("Config", ["use existing", "edit existing", "create new"]);
  if (action === "create new")
    return await promptForConfig(prompt, undefined, mode, configDir, stdout);

  const selected = await prompt.select(
    "Saved config",
    saved.map((config) => config.name),
    saved[0]?.name,
  );
  const loaded = await loadConfigReference(selected, configDir);
  if (action === "use existing") return loaded;
  return await promptForConfig(prompt, loaded.config, mode, configDir, stdout);
}

async function loadSingleSavedConfig(configDir?: string): Promise<LoadedConfig> {
  const saved = await listSavedConfigs(configDir);
  if (saved.length === 0) {
    throw new Error(
      "No saved configs found. Run `boltwall config create`, `boltwall dev`, or pass --config.",
    );
  }
  if (saved.length > 1) {
    throw new Error(
      `Multiple saved configs found (${saved.map((config) => config.name).join(", ")}). Pass --config <name-or-path>.`,
    );
  }
  return {
    path: saved[0]!.path,
    config: await loadBoltwallConfig(saved[0]!.path),
  };
}

async function loadConfigReference(reference: string, configDir?: string): Promise<LoadedConfig> {
  const tried: string[] = [];
  if (!isPathLike(reference)) {
    const saved = await findSavedConfig(reference, configDir);
    if (saved !== undefined) {
      return {
        path: saved.path,
        config: await loadBoltwallConfig(saved.path),
      };
    }
    tried.push(`saved config "${reference}"`);
  }

  const path = expandPath(reference);
  tried.push(path);
  if (existsSync(path)) {
    return {
      path,
      config: await loadBoltwallConfig(path),
    };
  }

  throw new Error(`Config not found: ${reference}. Checked ${tried.join(" and ")}.`);
}

async function promptForConfig(
  prompt: PromptDriver,
  existing: BoltwallConfig | undefined,
  mode: ConfigPromptMode,
  configDir?: string,
  stdout: Writable = defaultStdout,
): Promise<LoadedConfig> {
  const name = await prompt.input("Config name", existing?.name ?? "default");
  const backendKind = (await prompt.select(
    "Lightning backend",
    ["voltage-lnd", "lnd", "opennode", "btcpay"],
    existing?.backend.kind ?? "lnd",
  )) as BoltwallBackendKind;
  const defaultNames = backendEnvNames(backendKind);
  const allowBrowser = await prompt.confirm(
    "Allow browser apps to call this proxy",
    existing?.cors !== undefined || mode === "dev",
  );
  const cors = allowBrowser
    ? {
        allowOrigins: splitListRequired(
          await prompt.input(
            "Browser origins allowed to call this proxy (comma separated)",
            existing?.cors?.allowOrigins.join(",") ??
              (mode === "dev" ? "http://127.0.0.1:3000,http://localhost:3000" : ""),
          ),
          "Allowed browser origins",
        ),
        exposeHeaders: existing?.cors?.exposeHeaders ?? ["WWW-Authenticate"],
        allowMethods: existing?.cors?.allowMethods ?? ["GET", "OPTIONS"],
        allowHeaders: existing?.cors?.allowHeaders ?? ["Authorization", "Content-Type"],
        maxAgeSeconds: existing?.cors?.maxAgeSeconds ?? 600,
      }
    : undefined;
  const targetUrl = await prompt.input("Upstream target URL", existing?.targetUrl ?? "");
  const defaultPriceMsat = await prompt.input(
    "Default price for protected requests, in millisatoshis",
    existing?.pricing.defaultPriceMsat ?? "1000",
  );
  const protectedPath = await prompt.input("Protected path", existing?.routes?.[0]?.path ?? "/*");
  const protectedPathPriceMsat = await prompt.input(
    "Price for this protected path, in millisatoshis",
    existing?.routes?.[0]?.priceMsat ?? existing?.pricing.defaultPriceMsat ?? "1000",
  );
  const unprotectedPaths = splitList(
    await prompt.input(
      "Unprotected paths (comma separated)",
      existing?.unprotectedPaths?.join(",") ?? "/healthz",
    ),
  );
  write(stdout, "Advanced paywall policy (press Enter to skip optional caveats).\n");
  const service = optionalInput(
    await prompt.input(
      "Service name for service/capability caveats (blank for none)",
      existing?.service ?? "",
    ),
  );
  const validUntilSeconds = await prompt.input(
    "Credential lifetime in seconds (blank for no expiration caveat)",
    existing?.policy?.validUntilSeconds === undefined
      ? ""
      : String(existing.policy.validUntilSeconds),
  );
  const origin = await prompt.input(
    "Origin caveat origins (comma separated, blank for none)",
    defaultOriginCaveatInput(existing),
  );
  const capabilities = await prompt.input(
    "Capability caveats to mint (comma separated, blank for none)",
    existing?.policy?.capabilities?.join(",") ?? "",
  );
  if (splitList(capabilities) !== undefined && service === undefined) {
    throw new Error("Capability caveats require a service name.");
  }
  const hodl = await prompt.confirm("Use HODL invoices", existing?.policy?.hodl === true);
  const input: BoltwallConfigInput = {
    name,
    targetUrl,
    service,
    backend: {
      kind: backendKind,
      env: configBackendEnvNames(backendKind, existing?.backend.env),
    },
    pricing: {
      defaultPriceMsat,
    },
    routes: [
      {
        path: protectedPath,
        methods: existing?.routes?.[0]?.methods ?? ["GET"],
        priceMsat: protectedPathPriceMsat,
      },
    ],
    challengeCompatibility: existing?.challengeCompatibility ?? "dual",
    unprotectedPaths,
    ...promptedPolicy(existing, { validUntilSeconds, origin, capabilities, hodl }),
    forwardHeaders: existing?.forwardHeaders ?? {
      allow: ["accept", "content-type", "x-request-id"],
      deny: ["cookie", "authorization"],
    },
    ...(cors === undefined ? {} : { cors }),
    ...(existing?.deploy.projectName === undefined
      ? { deploy: { target: "vercel" } }
      : { deploy: { target: "vercel", projectName: existing.deploy.projectName } }),
  };
  const config = parseBoltwallConfig(input);
  const path = await saveConfig(config, configPathForName(config.name ?? "default", configDir));
  write(stdout, `Saved config: ${path}\n`);
  return { config, path };
}

function addCorsOrigins(config: BoltwallConfig, origins: string[]): BoltwallConfig {
  const existing = config.cors;
  const allowOrigins = [
    ...(existing?.allowOrigins ?? []),
    ...origins.map((origin) => origin.trim()).filter((origin) => origin.length > 0),
  ];
  if (allowOrigins.length === 0)
    throw new Error("config allow-origin requires at least one origin");

  return parseBoltwallConfig({
    ...config,
    cors: {
      allowOrigins: Array.from(new Set(allowOrigins)),
      exposeHeaders: existing?.exposeHeaders ?? ["WWW-Authenticate"],
      allowMethods: existing?.allowMethods ?? ["GET", "OPTIONS"],
      allowHeaders: existing?.allowHeaders ?? ["Authorization", "Content-Type"],
      maxAgeSeconds: existing?.maxAgeSeconds ?? 600,
    },
  });
}

function promptedPolicy(
  existing: BoltwallConfig | undefined,
  inputs: { validUntilSeconds: string; origin: string; capabilities: string; hodl: boolean },
): Pick<BoltwallConfigInput, "policy"> {
  const validUntilSeconds = optionalInput(inputs.validUntilSeconds);
  const origin = splitList(inputs.origin);
  const capabilities = splitList(inputs.capabilities);
  if (
    validUntilSeconds === undefined &&
    origin === undefined &&
    capabilities === undefined &&
    inputs.hodl !== true &&
    existing?.policy === undefined
  ) {
    return {};
  }

  const nextPolicy: BoltwallConfigInput["policy"] = {
    ...(existing?.policy?.validUntil === undefined
      ? {}
      : { validUntil: existing.policy.validUntil }),
    ...(validUntilSeconds === undefined ? {} : { validUntilSeconds: Number(validUntilSeconds) }),
    ...(origin === undefined ? {} : { origin }),
    ...(capabilities === undefined ? {} : { capabilities }),
    ...(inputs.hodl === true ? { hodl: true as const } : {}),
    ...(existing?.policy?.requires === undefined ? {} : { requires: existing.policy.requires }),
  };

  return Object.keys(nextPolicy).length === 0 ? {} : { policy: nextPolicy };
}

function defaultOriginCaveatInput(existing: BoltwallConfig | undefined): string {
  if (existing?.policy?.origin !== undefined) return existing.policy.origin.join(",");
  return "";
}

async function ensureDeployMetadata(
  loaded: LoadedConfig,
  prompt: PromptDriver,
  stdout: Writable,
  promptForMissing: boolean,
): Promise<BoltwallConfig> {
  const config = loaded.config;
  const fallbackProjectName = config.deploy.projectName ?? config.name ?? "boltwall-proxy";
  if (config.deploy.projectName === undefined && !promptForMissing) {
    const next = parseBoltwallConfig({
      ...config,
      deploy: { ...config.deploy, projectName: fallbackProjectName },
    });
    const path = await saveConfig(next, loaded.path);
    write(stdout, `Saved config: ${path}\n`);
    return next;
  }
  const projectName = await prompt.input("Vercel project name", fallbackProjectName);
  if (projectName === config.deploy.projectName) return config;
  const next = parseBoltwallConfig({
    ...config,
    deploy: { ...config.deploy, projectName },
  });
  const path = await saveConfig(next, loaded.path);
  write(stdout, `Saved config: ${path}\n`);
  return next;
}

async function promptForSecrets(
  config: BoltwallConfig,
  prompt: PromptDriver,
  env: Record<string, string | undefined>,
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  const vars = backendEnvNames(config.backend.kind, config.backend.envPrefix, config.backend.env);
  for (const [key, name] of requiredEnvEntries(config, vars)) {
    if (env[name] !== undefined && env[name]!.trim() !== "") continue;
    const description = backendEnvDescription(config.backend.kind, key);
    values[name] = await prompt.secret(`${name} (${description}; not saved to config)`);
  }
  return values;
}

function validateConfig(config: BoltwallConfig, env: Record<string, string | undefined>) {
  const backend = createBackendFromEnv(config, env);
  validateBackendCapabilities(config, backend);
  return backend;
}

function writeValidationSummary(stdout: Writable, config: BoltwallConfig): void {
  write(
    stdout,
    `${JSON.stringify(
      {
        config: configSummary(config),
      },
      null,
      2,
    )}\n`,
  );
}

function writeConfigSummary(stdout: Writable, config: BoltwallConfig): void {
  write(
    stdout,
    `${JSON.stringify(
      {
        config: configSummary(config),
        requiredEnv: requiredEnvNameSummary(config),
      },
      null,
      2,
    )}\n`,
  );
}

function requiredEnvNameSummary(config: BoltwallConfig): Record<string, unknown> {
  const vars = backendEnvNames(config.backend.kind, config.backend.envPrefix, config.backend.env);
  return Object.fromEntries(
    requiredEnvEntries(config, vars).map(([key, name]) => [
      key,
      { env: name, expected: backendEnvDescription(config.backend.kind, key) },
    ]),
  );
}

function configBackendEnvNames(
  kind: BoltwallBackendKind,
  existing: BoltwallConfig["backend"]["env"] | undefined,
): BoltwallConfigInput["backend"]["env"] {
  const defaults = backendEnvNames(kind);

  if (kind === "lnd") {
    return {
      socket: existing?.socket ?? defaults.socket,
      cert: existing?.cert ?? defaults.cert,
      macaroon: existing?.macaroon ?? defaults.macaroon,
    };
  }

  if (kind === "voltage-lnd") {
    return {
      baseUrl: existing?.baseUrl ?? defaults.baseUrl,
      cert: existing?.cert ?? defaults.cert,
      macaroon: existing?.macaroon ?? defaults.macaroon,
    };
  }

  if (kind === "opennode") {
    return {
      apiKey: existing?.apiKey ?? defaults.apiKey,
      baseUrl: existing?.baseUrl ?? defaults.baseUrl,
    };
  }

  return {
    baseUrl: existing?.baseUrl ?? defaults.baseUrl,
    apiKey: existing?.apiKey ?? defaults.apiKey,
    storeId: existing?.storeId ?? defaults.storeId,
    cryptoCode: existing?.cryptoCode ?? defaults.cryptoCode,
    hodlInvoices: existing?.hodlInvoices ?? defaults.hodlInvoices,
    streamingInvoices: existing?.streamingInvoices ?? defaults.streamingInvoices,
  };
}

function requiredEnvEntries(
  config: BoltwallConfig,
  vars: BoltwallBackendEnvNames,
): [keyof BoltwallBackendEnvNames, string][] {
  if (config.backend.kind === "lnd") {
    return [
      ["socket", vars.socket],
      ["cert", vars.cert],
      ["macaroon", vars.macaroon],
    ];
  }
  if (config.backend.kind === "voltage-lnd") {
    return [
      ["baseUrl", vars.baseUrl],
      ["macaroon", vars.macaroon],
      ["cert", vars.cert],
    ];
  }
  if (config.backend.kind === "opennode") return [["apiKey", vars.apiKey]];
  return [
    ["baseUrl", vars.baseUrl],
    ["apiKey", vars.apiKey],
    ["storeId", vars.storeId],
  ];
}

function parseFlags(argv: string[]): {
  values: Record<string, string>;
  boolean: Set<string>;
  positionals: string[];
} {
  const values: Record<string, string> = {};
  const boolean = new Set<string>();
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
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
  return { values, boolean, positionals };
}

function splitList(value: string): string[] | undefined {
  const values = splitListRequired(value, "");
  return values.length === 0 ? undefined : values;
}

function splitListRequired(value: string, label: string): string[] {
  const values = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (label !== "" && values.length === 0)
    throw new Error(`${label} must include at least one value`);
  return values;
}

function optionalInput(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function isPathLike(value: string): boolean {
  return (
    value.startsWith(".") ||
    value.startsWith("~") ||
    value.includes("/") ||
    value.includes("\\") ||
    [".json", ".yaml", ".yml"].includes(extname(value))
  );
}

function expandPath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return resolve(homedir(), value.slice(2));
  return resolve(value);
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

interface MaskedInterface {
  _writeToOutput?: (value: string) => void;
  close(): void;
  question(query: string, callback: (answer: string) => void): void;
}

export class ReadlinePrompt implements PromptDriver {
  constructor(
    private readonly inputStream: Readable,
    private readonly outputStream: Writable,
  ) {}

  async input(message: string, defaultValue?: string): Promise<string> {
    const rl = createQuestionInterface({ input: this.inputStream, output: this.outputStream });
    try {
      const suffix = defaultValue === undefined || defaultValue === "" ? "" : ` [${defaultValue}]`;
      const answer = await rl.question(`${message}${suffix}: `);
      return answer.trim() === "" && defaultValue !== undefined ? defaultValue : answer.trim();
    } finally {
      rl.close();
    }
  }

  async secret(message: string): Promise<string> {
    write(this.outputStream, `${message}: `);
    const rl = createMaskedInterface({
      input: this.inputStream,
      output: this.outputStream,
      terminal: true,
    }) as MaskedInterface;
    rl._writeToOutput = () => {};

    try {
      const answer = await new Promise<string>((resolve) => {
        rl.question("", resolve);
      });
      write(this.outputStream, "\n");
      return answer.trim();
    } finally {
      rl.close();
    }
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const suffix = defaultValue ? "Y/n" : "y/N";
    const answer = (await this.input(`${message} (${suffix})`)).toLowerCase();
    if (answer === "") return defaultValue;
    return answer === "y" || answer === "yes";
  }

  async select(message: string, choices: string[], defaultValue?: string): Promise<string> {
    if (choices.length === 0) throw new Error(`${message}: no choices available`);
    const fallback = defaultValue ?? choices[0]!;
    write(this.outputStream, `${message}:\n`);
    choices.forEach((choice, index) => {
      const marker = choice === fallback ? " (default)" : "";
      write(this.outputStream, `  ${index + 1}. ${choice}${marker}\n`);
    });
    const answer = await this.input(`Choose ${message.toLowerCase()}`, fallback);
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

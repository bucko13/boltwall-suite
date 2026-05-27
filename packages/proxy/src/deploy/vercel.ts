import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { BoltwallConfig } from "../config-schema.js";
import {
  backendEnvNames,
  vercelRuntimeEnv,
  type BoltwallBackendEnvNames,
} from "../config-schema.js";
import { deploymentDirForConfig } from "../config-store.js";

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(command: string, args: string[], options?: CommandRunnerOptions): Promise<CommandResult>;
}

export interface CommandRunnerOptions {
  cwd?: string;
  stdin?: string;
}

export interface VercelDeployOptions {
  config: BoltwallConfig;
  configDir?: string;
  env?: Record<string, string | undefined>;
  production?: boolean;
  secretValues?: Record<string, string>;
  runner?: CommandRunner;
}

export interface VercelDeployResult {
  projectDir: string;
  deploymentUrl: string;
  environment: "preview" | "production";
}

export class VercelDeployError extends Error {
  override readonly name = "VercelDeployError";
}

export const nodeCommandRunner: CommandRunner = {
  run(command, args, options) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options?.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ code, stdout, stderr });
      });

      if (options?.stdin !== undefined) {
        child.stdin.end(options.stdin);
      } else {
        child.stdin.end();
      }
    });
  },
};

export async function deployVercel(options: VercelDeployOptions): Promise<VercelDeployResult> {
  const runner = options.runner ?? nodeCommandRunner;
  const config = options.config;
  const projectDir = deploymentDirForConfig(config.name ?? "default", options.configDir);
  const environment = options.production === true ? "production" : "preview";

  await writeVercelProject(projectDir, config);
  await setVercelEnvironment({
    config,
    projectDir,
    environment,
    runner,
    env: options.env ?? process.env,
    secretValues: options.secretValues ?? {},
  });

  const deployArgs = ["deploy", "--cwd", projectDir, "--yes"];
  if (options.production === true) deployArgs.push("--prod");
  const deployed = await runner.run("vercel", deployArgs);
  if (deployed.code !== 0) {
    throw new VercelDeployError(redactCommandFailure("vercel deploy failed", deployed));
  }

  return {
    projectDir,
    environment,
    deploymentUrl: deployed.stdout.trim(),
  };
}

async function writeVercelProject(projectDir: string, config: BoltwallConfig): Promise<void> {
  await mkdir(join(projectDir, "api"), { recursive: true });
  await writeFile(join(projectDir, "package.json"), generatedPackageJson(config), { mode: 0o600 });
  await writeFile(join(projectDir, "vercel.json"), generatedVercelJson(), { mode: 0o600 });
  await writeFile(join(projectDir, "api", "index.ts"), generatedApiIndex(), { mode: 0o600 });
}

async function setVercelEnvironment(options: {
  config: BoltwallConfig;
  projectDir: string;
  environment: "preview" | "production";
  runner: CommandRunner;
  env: Record<string, string | undefined>;
  secretValues: Record<string, string>;
}): Promise<void> {
  const runtime = vercelRuntimeEnv(options.config);
  const sourceNames = backendEnvNames(
    options.config.backend.kind,
    options.config.backend.envPrefix,
    options.config.backend.env,
  );
  const targetNames = backendEnvNames(options.config.backend.kind);

  for (const [name, value] of Object.entries(runtime)) {
    await addVercelEnv(options.runner, options.projectDir, options.environment, name, value, false);
  }

  for (const key of requiredSecretKeys(options.config)) {
    const sourceName = sourceNames[key];
    const targetName = targetNames[key];
    const value =
      options.secretValues[sourceName] ??
      options.env[sourceName] ??
      options.secretValues[targetName] ??
      options.env[targetName];
    if (value === undefined || value.trim() === "") {
      throw new VercelDeployError(
        `Missing ${sourceName}. Set it in the current environment or run interactive deploy so Boltwall can add it to Vercel.`,
      );
    }
    await addVercelEnv(
      options.runner,
      options.projectDir,
      options.environment,
      targetName,
      value,
      true,
    );
  }
}

function requiredSecretKeys(config: BoltwallConfig): (keyof BoltwallBackendEnvNames)[] {
  if (config.backend.kind === "lnd") return ["socket", "cert", "macaroon"];
  if (config.backend.kind === "voltage-lnd") return ["baseUrl", "macaroon", "cert"];
  if (config.backend.kind === "opennode") return ["apiKey"];
  return ["baseUrl", "apiKey", "storeId"];
}

async function addVercelEnv(
  runner: CommandRunner,
  cwd: string,
  environment: "preview" | "production",
  name: string,
  value: string,
  sensitive: boolean,
): Promise<void> {
  const args = ["env", "add", name, environment, "--force", "--cwd", cwd];
  if (sensitive) args.push("--sensitive");
  const result = await runner.run("vercel", args, { stdin: `${value}\n` });
  if (result.code !== 0) {
    throw new VercelDeployError(redactCommandFailure(`vercel env add ${name} failed`, result));
  }
}

function generatedPackageJson(config: BoltwallConfig): string {
  return `${JSON.stringify(
    {
      name: config.deploy.projectName ?? config.name ?? "boltwall-proxy",
      private: true,
      type: "module",
      scripts: {
        start: "node api/index.ts",
      },
      dependencies: {
        "@boltwall/adapters": "latest",
        "@boltwall/l402": "latest",
        "@boltwall/proxy": "latest",
        express: "^5.1.0",
      },
      devDependencies: {
        typescript: "^6.0.0",
      },
    },
    null,
    2,
  )}\n`;
}

function generatedVercelJson(): string {
  return `${JSON.stringify(
    {
      rewrites: [{ source: "/(.*)", destination: "/api" }],
    },
    null,
    2,
  )}\n`;
}

function generatedApiIndex(): string {
  return `import { BtcPayAdapter } from "@boltwall/adapters/btcpay";
import { LndAdapter } from "@boltwall/adapters/lnd";
import { OpenNodeAdapter } from "@boltwall/adapters/opennode";
import { createVoltageLndAdapter } from "@boltwall/adapters/voltage-lnd";
import { InMemoryRootKeyStore, validUntil, validUntilSatisfier } from "@boltwall/l402";
import { createProxy } from "@boltwall/proxy";

const env = process.env;
// Backend credential env values are never generated into config. For local LND,
// LND_TLS_CERT is certificate content (base64 from infra/scripts/lnd-env; PEM
// may also be accepted by the underlying lightning package) and LND_MACAROON is
// macaroon content (base64 from infra/scripts/lnd-env). Path-based tools should
// use path-named variables such as LND_TLS_CERT_PATH instead.
const backend = (() => {
  const kind = requireEnv("LN_BACKEND");
  if (kind === "lnd") {
    return new LndAdapter({
      socket: requireEnv("LND_SOCKET"),
      cert: requireEnv("LND_TLS_CERT"),
      macaroon: requireEnv("LND_MACAROON"),
    });
  }
  if (kind === "voltage-lnd") {
    return createVoltageLndAdapter({
      baseUrl: requireEnv("VOLTAGE_LND_BASE_URL"),
      cert: requireEnv("VOLTAGE_LND_CERT"),
      macaroon: requireEnv("VOLTAGE_LND_MACAROON"),
    });
  }
  if (kind === "opennode") {
    return new OpenNodeAdapter({
      apiKey: requireEnv("OPENNODE_API_KEY"),
      ...(optionalEnv("OPENNODE_BASE_URL") === undefined ? {} : { baseUrl: optionalEnv("OPENNODE_BASE_URL") }),
    });
  }
  if (kind === "btcpay") {
    return new BtcPayAdapter({
      baseUrl: requireEnv("BTCPAY_BASE_URL"),
      apiKey: requireEnv("BTCPAY_API_KEY"),
      storeId: requireEnv("BTCPAY_STORE_ID"),
      cryptoCode: optionalEnv("BTCPAY_CRYPTO_CODE") ?? "BTC",
      features: {
        hodlInvoices: optionalEnv("BTCPAY_HODL_INVOICES") === "true",
        streamingInvoices: optionalEnv("BTCPAY_STREAMING_INVOICES") === "true",
      },
    });
  }
  throw new Error("LN_BACKEND must be lnd, voltage-lnd, opennode, or btcpay");
})();

const app = createProxy({
  targetUrl: requireEnv("TARGET_URL"),
  backend,
  rootKeyStore: new InMemoryRootKeyStore(),
  defaultPrice: BigInt(optionalEnv("DEFAULT_PRICE_MSAT") ?? "1000"),
  challengeCompatibility: challengeCompatibility(),
  ...(optionalEnv("SERVICE") === undefined ? {} : { service: optionalEnv("SERVICE") }),
  ...(optionalEnv("UNPROTECTED_PATHS") === undefined ? {} : { unprotectedPaths: splitList(requireEnv("UNPROTECTED_PATHS")) }),
  forwardHeaders: {
    ...(optionalEnv("FORWARD_ALLOW") === undefined ? {} : { allow: splitList(requireEnv("FORWARD_ALLOW")) }),
    ...(optionalEnv("FORWARD_DENY") === undefined ? {} : { deny: splitList(requireEnv("FORWARD_DENY")) }),
  },
  ...(optionalEnv("CORS_ALLOW_ORIGINS") === undefined ? {} : { cors: corsConfig() }),
  ...(optionalEnv("UPSTREAM_TIMEOUT_MS") === undefined ? {} : { upstreamTimeoutMs: Number(optionalEnv("UPSTREAM_TIMEOUT_MS")) }),
  ...paywallPolicy(),
});

export default app;

function requireEnv(name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(\`Missing required environment variable \${name}\`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value;
}

function splitList(value: string): string[] {
  return value.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
}

function corsConfig() {
  return {
    allowOrigins: corsOrigins(),
    ...(optionalEnv("CORS_EXPOSE_HEADERS") === undefined ? {} : { exposeHeaders: splitList(requireEnv("CORS_EXPOSE_HEADERS")) }),
    ...(optionalEnv("CORS_ALLOW_HEADERS") === undefined ? {} : { allowHeaders: splitList(requireEnv("CORS_ALLOW_HEADERS")) }),
    ...(optionalEnv("CORS_ALLOW_METHODS") === undefined ? {} : { allowMethods: splitList(requireEnv("CORS_ALLOW_METHODS")) }),
    ...(optionalEnv("CORS_MAX_AGE_SECONDS") === undefined ? {} : { maxAgeSeconds: positiveIntegerEnv("CORS_MAX_AGE_SECONDS") }),
  };
}

function corsOrigins(): string[] {
  const origins = splitList(requireEnv("CORS_ALLOW_ORIGINS"));
  if (origins.length === 0) throw new Error("CORS_ALLOW_ORIGINS must include at least one origin");
  return origins.map((origin) => new URL(origin).origin);
}

function positiveIntegerEnv(name: string): number {
  const value = Number(requireEnv(name));
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(\`\${name} must be a non-negative integer\`);
  }
  return value;
}

function paywallPolicy() {
  const caveats = [
    ...(optionalEnv("POLICY_VALID_UNTIL") === undefined ? [] : [validUntil({ iso: requireEnv("POLICY_VALID_UNTIL") })]),
    ...(optionalEnv("POLICY_VALID_UNTIL_SECONDS") === undefined
      ? []
      : [() => validUntil({ seconds: positiveIntegerEnv("POLICY_VALID_UNTIL_SECONDS") })]),
  ];

  return {
    ...(caveats.length === 0 ? {} : { caveats, satisfiers: [validUntilSatisfier()] }),
    ...(optionalEnv("CAPABILITIES") === undefined ? {} : { capabilities: splitList(requireEnv("CAPABILITIES")) }),
    ...(optionalEnv("PAYWALL_HODL") === "true" ? { hodl: true } : {}),
  };
}

function challengeCompatibility(): "dual" | "l402-only" | "lsat-only" {
  const value = optionalEnv("CHALLENGE_COMPATIBILITY") ?? "dual";
  if (value === "dual" || value === "l402-only" || value === "lsat-only") return value;
  throw new Error("CHALLENGE_COMPATIBILITY must be dual, l402-only, or lsat-only");
}
`;
}

function redactCommandFailure(prefix: string, result: CommandResult): string {
  const detail = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
  return detail.length === 0 ? prefix : `${prefix}: ${redact(detail)}`;
}

function redact(value: string): string {
  const names = [
    ...Object.values(backendEnvNames("lnd")),
    ...Object.values(backendEnvNames("voltage-lnd")),
    ...Object.values(backendEnvNames("opennode")),
    ...Object.values(backendEnvNames("btcpay")),
  ];
  let out = value;
  for (const name of names) {
    out = out.replaceAll(name, name);
  }
  return out.replace(/[A-Za-z0-9+/=_-]{32,}/gu, "[redacted]");
}

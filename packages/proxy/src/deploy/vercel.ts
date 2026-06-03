import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BoltwallConfig } from "../config-schema.js";
import {
  backendEnvNames,
  vercelRuntimeEnv,
  type BoltwallBackendEnvNames,
} from "../config-schema.js";
import { deploymentDirForConfig } from "../config-store.js";

const VERCEL_ROOT_KEY_ENV = "BOLTWALL_PROXY_ROOT_KEY";

/** Result of one shell command run during Vercel deployment. */
export interface CommandResult {
  /** Process exit code, or `null` if the process ended without one. */
  code: number | null;
  /** Captured stdout. */
  stdout: string;
  /** Captured stderr. */
  stderr: string;
}

/** Minimal command runner used by deployment code and tests. */
export interface CommandRunner {
  run(command: string, args: string[], options?: CommandRunnerOptions): Promise<CommandResult>;
}

/** Options passed to a command runner. */
export interface CommandRunnerOptions {
  /** Working directory for the command. */
  cwd?: string;
  /** Optional stdin sent to the command. */
  stdin?: string;
}

/** Inputs for deploying a generated Boltwall proxy project to Vercel. */
export interface VercelDeployOptions {
  /** Validated saved proxy config. */
  config: BoltwallConfig;
  /** Optional config directory used to place generated deployment files. */
  configDir?: string;
  /** Env-like record used for backend credential lookup. */
  env?: Record<string, string | undefined>;
  /** Deploy to Vercel production when true; otherwise create a preview deployment. */
  production?: boolean;
  /** Secret values supplied by the caller or prompt flow. Values are never logged. */
  secretValues?: Record<string, string>;
  /** Command runner injection for tests and custom shells. */
  runner?: CommandRunner;
}

/** Result returned after a Vercel deployment succeeds. */
export interface VercelDeployResult {
  /** Directory containing the generated Vercel project files. */
  projectDir: string;
  /** URL printed by `vercel deploy`. */
  deploymentUrl: string;
  /** Vercel environment targeted by the deploy. */
  environment: "preview" | "production";
}

/** Thrown when Vercel CLI readiness or deployment fails. */
export class VercelDeployError extends Error {
  override readonly name = "VercelDeployError";
}

/**
 * Verify that the Vercel CLI is installed and authenticated.
 *
 * @param runner - Command runner used to invoke `vercel`.
 * @throws {VercelDeployError} when the CLI is missing or not logged in.
 */
export async function assertVercelCliReady(
  runner: CommandRunner = nodeCommandRunner,
): Promise<void> {
  try {
    const installed = await runner.run("vercel", ["--version"]);
    if (installed.code !== 0) {
      throw new VercelDeployError(
        redactCommandFailure(
          "Vercel CLI is required before running boltwall deploy. Install it and try again",
          installed,
        ),
      );
    }
  } catch (error) {
    if (error instanceof VercelDeployError) throw error;
    throw new VercelDeployError(
      "Vercel CLI is required before running boltwall deploy. Install it, ensure `vercel` is on PATH, then try again.",
    );
  }

  const authenticated = await runner.run("vercel", ["whoami"]);
  if (authenticated.code !== 0) {
    throw new VercelDeployError(
      redactCommandFailure(
        "Vercel CLI must be authenticated before running boltwall deploy. Run `vercel login`, then try again",
        authenticated,
      ),
    );
  }
}

/** Default command runner backed by `node:child_process.spawn`. */
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

/**
 * Generate and deploy a Vercel project for a saved proxy config.
 *
 * Backend credentials and the generated proxy root key are provisioned as
 * Vercel env vars. Command failures are redacted before they are surfaced.
 *
 * @param options - Deployment config, environment, secret values, and runner.
 * @returns Generated project directory and deployed URL.
 * @throws {VercelDeployError} when CLI commands fail.
 */
export async function deployVercel(options: VercelDeployOptions): Promise<VercelDeployResult> {
  const runner = options.runner ?? nodeCommandRunner;
  const config = options.config;
  const projectDir = deploymentDirForConfig(config.name ?? "default", options.configDir);
  const environment = options.production === true ? "production" : "preview";

  await writeVercelProject(projectDir, config);
  await linkVercelProject(
    runner,
    projectDir,
    config.deploy.projectName ?? config.name ?? "boltwall-proxy",
  );
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
  await writeFile(join(projectDir, "package.json"), await generatedPackageJson(config), {
    mode: 0o600,
  });
  await writeFile(join(projectDir, "vercel.json"), generatedVercelJson(), { mode: 0o600 });
  await writeFile(join(projectDir, "api", "index.ts"), generatedApiIndex(config), { mode: 0o600 });
}

async function linkVercelProject(
  runner: CommandRunner,
  cwd: string,
  projectName: string,
): Promise<void> {
  const result = await runner.run("vercel", [
    "link",
    "--yes",
    "--project",
    projectName,
    "--cwd",
    cwd,
  ]);
  if (result.code !== 0) {
    throw new VercelDeployError(
      redactCommandFailure(
        `vercel link failed. Link the generated project first with \`vercel link --cwd ${cwd}\`, then run \`boltwall deploy\` again`,
        result,
      ),
    );
  }
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

  const rootKeySecret =
    options.secretValues[VERCEL_ROOT_KEY_ENV] ??
    options.env[VERCEL_ROOT_KEY_ENV] ??
    randomBytes(32).toString("hex");
  await addVercelEnv(
    options.runner,
    options.projectDir,
    options.environment,
    VERCEL_ROOT_KEY_ENV,
    rootKeySecret,
    true,
  );

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
    throw new VercelDeployError(
      redactCommandFailure(`vercel env add ${name} failed`, result, sensitive ? [value] : []),
    );
  }
}

async function generatedPackageJson(config: BoltwallConfig): Promise<string> {
  const boltwallVersions = await generatorPackageVersions();
  return `${JSON.stringify(
    {
      name: config.deploy.projectName ?? config.name ?? "boltwall-proxy",
      private: true,
      type: "module",
      scripts: {
        start: "node api/index.ts",
      },
      dependencies: {
        "@boltwall/adapters": boltwallVersions.adapters,
        "@boltwall/l402": boltwallVersions.l402,
        "@boltwall/proxy": boltwallVersions.proxy,
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

async function generatorPackageVersions(): Promise<{
  adapters: string;
  l402: string;
  proxy: string;
}> {
  const proxyManifest = await readProxyManifest();
  return {
    adapters: await dependencyVersion(proxyManifest, "@boltwall/adapters", "adapters"),
    l402: await dependencyVersion(proxyManifest, "@boltwall/l402", "l402"),
    proxy: manifestVersion(proxyManifest, "@boltwall/proxy"),
  };
}

async function dependencyVersion(
  proxyManifest: PackageManifest,
  dependencyName: "@boltwall/adapters" | "@boltwall/l402",
  workspacePackageDir: "adapters" | "l402",
): Promise<string> {
  const declared = proxyManifest.dependencies?.[dependencyName];
  if (declared !== undefined && !declared.startsWith("workspace:")) {
    return declared;
  }

  const manifest = await readSiblingManifest(workspacePackageDir);
  return manifestVersion(manifest, dependencyName);
}

async function readProxyManifest(): Promise<PackageManifest> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "../../package.json"), join(here, "../package.json")];
  for (const candidate of candidates) {
    try {
      return parsePackageManifest(await readFile(candidate, "utf8"));
    } catch {
      // Try the next layout. Source tests run from src/deploy; packaged CLI runs from dist.
    }
  }
  throw new VercelDeployError("Unable to resolve @boltwall/proxy package metadata");
}

async function readSiblingManifest(packageDir: "adapters" | "l402"): Promise<PackageManifest> {
  const here = dirname(fileURLToPath(import.meta.url));
  // Two monorepo layouts, mirroring readProxyManifest: source/tests run from
  // packages/proxy/src/deploy, the bundled CLI runs from packages/proxy/dist.
  const candidates = [
    join(here, `../../../${packageDir}/package.json`),
    join(here, `../../${packageDir}/package.json`),
  ];
  for (const candidate of candidates) {
    try {
      return parsePackageManifest(await readFile(candidate, "utf8"));
    } catch {
      // Try the next layout if this package gains another generated CLI layout.
    }
  }
  throw new VercelDeployError(`Unable to resolve @boltwall/${packageDir} package metadata`);
}

function parsePackageManifest(raw: string): PackageManifest {
  return JSON.parse(raw) as PackageManifest;
}

function manifestVersion(manifest: PackageManifest, packageName: string): string {
  if (typeof manifest.version === "string" && manifest.version.length > 0) {
    return manifest.version;
  }
  throw new VercelDeployError(`Unable to resolve ${packageName} package version`);
}

interface PackageManifest {
  version?: unknown;
  dependencies?: Record<string, string | undefined>;
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

function generatedApiIndex(config: BoltwallConfig): string {
  // The LND backend pulls in `lightning` -> `tiny-secp256k1`, which loads
  // `secp256k1.wasm` at runtime via a readFileSync the Vercel file tracer does
  // not follow, so the asset is dropped and the deployed function crashes with
  // ENOENT. A `new URL(<literal>, import.meta.url)` reference IS traced by the
  // bundler, so it forces the wasm into the function. The path resolves the same
  // at build and runtime, and the read is a harmless no-op.
  const lndWasmImport =
    config.backend.kind === "lnd"
      ? `import { readFileSync as __bundleWasm } from "node:fs";\n`
      : "";
  const lndWasmAssetHint =
    config.backend.kind === "lnd"
      ? `\ntry {\n  __bundleWasm(new URL("../node_modules/tiny-secp256k1/lib/secp256k1.wasm", import.meta.url));\n} catch {}\n`
      : "";
  return `import { createHmac } from "node:crypto";
${lndWasmImport}
import { BtcPayAdapter } from "@boltwall/adapters/btcpay";
import { LndAdapter } from "@boltwall/adapters/lnd";
import { OpenNodeAdapter } from "@boltwall/adapters/opennode";
import { originCaveat, originSatisfier, validUntil, validUntilSatisfier } from "@boltwall/l402";
import { createProxy } from "@boltwall/proxy";
${lndWasmAssetHint}
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
  throw new Error("LN_BACKEND must be lnd, opennode, or btcpay");
})();

class EnvRootKeyStore {
  #secret;

  constructor(secret: string) {
    const trimmed = secret.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      throw new Error("BOLTWALL_PROXY_ROOT_KEY must be a 32-byte hex secret");
    }
    this.#secret = Buffer.from(trimmed, "hex");
  }

  async get(tokenId: Uint8Array) {
    // L402 macaroon-spec.md §Identifier Structure / §Minting require a
    // server-side 32-byte root key per token id. This release-MVP Vercel store
    // deterministically derives that key from a deployment secret and token id.
    return createHmac("sha256", this.#secret).update(tokenId).digest();
  }

  async put() {
    // The key is derived from BOLTWALL_PROXY_ROOT_KEY, so there is no mutable
    // per-token write surface in this Vercel MVP store.
  }

  async delete() {
    // L402 macaroon-spec.md §Revocation requires deleting the stored root key.
    // This env-secret MVP cannot revoke individual credentials; rotate the
    // deployment secret to invalidate every credential minted by this proxy.
  }
}

const app = createProxy({
  targetUrl: requireEnv("TARGET_URL"),
  backend,
  rootKeyStore: new EnvRootKeyStore(requireEnv("BOLTWALL_PROXY_ROOT_KEY")),
  defaultPrice: BigInt(optionalEnv("DEFAULT_PRICE_MSAT") ?? "1000"),
  challengeCompatibility: challengeCompatibility(),
  ...(optionalEnv("SERVICE") === undefined ? {} : { service: optionalEnv("SERVICE") }),
  ...(optionalEnv("UNPROTECTED_PATHS") === undefined ? {} : { unprotectedPaths: splitList(requireEnv("UNPROTECTED_PATHS")) }),
  forwardHeaders: {
    ...(optionalEnv("FORWARD_ALLOW") === undefined ? {} : { allow: splitList(requireEnv("FORWARD_ALLOW")) }),
    ...(optionalEnv("FORWARD_DENY") === undefined ? {} : { deny: splitList(requireEnv("FORWARD_DENY")) }),
  },
  ...(optionalEnv("CORS_ALLOW_ORIGINS") === undefined && optionalEnv("CORS_ALLOW_ORIGIN_PATTERNS") === undefined ? {} : { cors: corsConfig() }),
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
    ...(optionalEnv("CORS_ALLOW_ORIGINS") === undefined ? {} : { allowOrigins: corsOrigins() }),
    ...(optionalEnv("CORS_ALLOW_ORIGIN_PATTERNS") === undefined ? {} : { allowOriginPatterns: corsOriginPatterns() }),
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

function corsOriginPatterns(): string[] {
  const patterns = splitList(requireEnv("CORS_ALLOW_ORIGIN_PATTERNS"));
  if (patterns.length === 0) throw new Error("CORS_ALLOW_ORIGIN_PATTERNS must include at least one pattern");
  for (const pattern of patterns) {
    try {
      new RegExp(pattern, "u");
    } catch {
      throw new Error("CORS_ALLOW_ORIGIN_PATTERNS must contain valid regular expressions");
    }
  }
  return patterns;
}

function positiveIntegerEnv(name: string): number {
  const value = Number(requireEnv(name));
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(\`\${name} must be a non-negative integer\`);
  }
  return value;
}

function paywallPolicy() {
  const origin = optionalEnv("POLICY_ORIGIN") === undefined ? undefined : corsOriginsFrom("POLICY_ORIGIN");
  const caveats = [
    ...(optionalEnv("POLICY_VALID_UNTIL") === undefined ? [] : [validUntil({ iso: requireEnv("POLICY_VALID_UNTIL") })]),
    ...(optionalEnv("POLICY_VALID_UNTIL_SECONDS") === undefined
      ? []
      : [() => validUntil({ seconds: positiveIntegerEnv("POLICY_VALID_UNTIL_SECONDS") })]),
    ...(origin === undefined ? [] : [originCaveat(origin)]),
  ];
  const satisfiers = [
    ...(optionalEnv("POLICY_VALID_UNTIL") === undefined && optionalEnv("POLICY_VALID_UNTIL_SECONDS") === undefined
      ? []
      : [validUntilSatisfier()]),
    ...(origin === undefined ? [] : [originSatisfier(origin)]),
  ];

  return {
    ...(caveats.length === 0 ? {} : { caveats, satisfiers }),
    ...(optionalEnv("CAPABILITIES") === undefined ? {} : { capabilities: splitList(requireEnv("CAPABILITIES")) }),
    ...(optionalEnv("PAYWALL_HODL") === "true" ? { hodl: true as const } : {}),
  };
}

function corsOriginsFrom(name: string): string[] {
  const origins = splitList(requireEnv(name));
  if (origins.length === 0) throw new Error(\`\${name} must include at least one origin\`);
  return origins.map((origin) => new URL(origin).origin);
}

function challengeCompatibility(): "dual" | "l402-only" | "lsat-only" {
  const value = optionalEnv("CHALLENGE_COMPATIBILITY") ?? "dual";
  if (value === "dual" || value === "l402-only" || value === "lsat-only") return value;
  throw new Error("CHALLENGE_COMPATIBILITY must be dual, l402-only, or lsat-only");
}
`;
}

function redactCommandFailure(
  prefix: string,
  result: CommandResult,
  sensitiveValues: readonly string[] = [],
): string {
  const detail = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
  return detail.length === 0 ? prefix : `${prefix}: ${redact(detail, sensitiveValues)}`;
}

function redact(value: string, sensitiveValues: readonly string[] = []): string {
  const names = [
    ...Object.values(backendEnvNames("lnd")),
    ...Object.values(backendEnvNames("opennode")),
    ...Object.values(backendEnvNames("btcpay")),
  ];
  let out = value;
  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue.length > 0) {
      out = out.replaceAll(sensitiveValue, "[redacted]");
    }
  }
  for (const name of names) {
    out = out.replaceAll(name, name);
  }
  return out.replace(/[A-Za-z0-9+/=_-]{32,}/gu, "[redacted]");
}

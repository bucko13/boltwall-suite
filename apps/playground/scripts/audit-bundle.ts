#!/usr/bin/env bun
/**
 * Client-bundle secret audit.
 *
 * Scans .next/static/**\/*.js for:
 *   1. Literal values of known secret env vars (if set in the environment).
 *   2. API-key/bearer-token shaped strings that should never reach the client bundle.
 *
 * Exit 0 = clean.  Exit 1 = finding or self-test failure.
 *
 * Flags:
 *   --self-test   Inject a fake secret into a temp file, verify the scanner
 *                 catches it, then clean up. Proves the scanner works.
 */

import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const SELF_TEST = process.argv.includes("--self-test");
const FAKE_SECRET = "FAKE_LND_MACAROON_agEDbHRuYndhbGwCCm5ld19jaGFsbGVuZ2UAAAaabbccdd1234";

// Secret env vars whose literal values must never appear in the client bundle.
const SECRET_ENV_VARS = [
  "OPENNODE_API_KEY",
  "BTCPAY_API_KEY",
  "LND_MACAROON",
  "LND_TLS_CERT",
  "LND_ADMIN_MACAROON",
  "NWC_CONNECTION_STRING",
];

// Regex patterns for bearer/token shapes that must not reach the client.
const SHAPE_PATTERNS: { name: string; re: RegExp }[] = [
  // "Bearer " followed by 40+ non-whitespace chars (API key tokens).
  { name: "bearer-token", re: /Bearer\s+[A-Za-z0-9+/=_-]{40,}/g },
  // NEXT_PUBLIC_ prefixed secret key name appearing as a string literal
  // (catches accidental NEXT_PUBLIC_LND_MACAROON etc.).
  { name: "NEXT_PUBLIC_secret", re: /NEXT_PUBLIC_(LND_|OPENNODE_|BTCPAY_|NWC_)[A-Z_]+/g },
];

type Finding = { file: string; line: number; rule: string; snippet: string };
const findings: Finding[] = [];

function scanContent(filePath: string, content: string) {
  const lines = content.split("\n");

  // Rule 1: literal env var values
  for (const varName of SECRET_ENV_VARS) {
    const value = process.env[varName];
    if (!value || value.length < 8) continue;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(value)) {
        findings.push({
          file: filePath,
          line: i + 1,
          rule: `env:${varName}`,
          snippet: lines[i].slice(0, 100),
        });
      }
    }
  }

  // Rule 2: shape patterns
  for (const { name, re } of SHAPE_PATTERNS) {
    re.lastIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        findings.push({ file: filePath, line: i + 1, rule: name, snippet: lines[i].slice(0, 100) });
      }
      re.lastIndex = 0;
    }
  }
}

const BUNDLE_ROOT = ".next/static";

// In self-test mode inject a fake secret so we can prove the scanner fires.
let tempRelPath: string | null = null;
if (SELF_TEST) {
  mkdirSync(join(BUNDLE_ROOT, "chunks"), { recursive: true });
  tempRelPath = join("chunks", "__audit_self_test__.js");
  // Mimics an accidental NEXT_PUBLIC_ secret leak in the compiled bundle.
  writeFileSync(join(BUNDLE_ROOT, tempRelPath), `var x="NEXT_PUBLIC_LND_MACAROON=${FAKE_SECRET}";`);
}

const relPaths = await Array.fromAsync(
  new Bun.Glob("**/*.js").scan({ cwd: BUNDLE_ROOT, onlyFiles: true }),
);

for (const rel of relPaths) {
  const fullPath = join(BUNDLE_ROOT, rel);
  const content = await Bun.file(fullPath).text();
  scanContent(fullPath, content);
}

// Clean up self-test artefact before reporting.
if (tempRelPath) {
  try {
    rmSync(join(BUNDLE_ROOT, tempRelPath));
  } catch {
    /* ignore */
  }
}

if (SELF_TEST) {
  if (findings.length > 0) {
    console.log(`✓ Self-test passed: scanner caught ${findings.length} finding(s) as expected.`);
    for (const f of findings) console.log(`  ${f.file}:${f.line} [${f.rule}]`);
    process.exit(0);
  }
  console.error("✗ Self-test FAILED: scanner found nothing — audit patterns are broken.");
  process.exit(1);
}

if (findings.length > 0) {
  console.error(`✗ Secret audit FAILED: ${findings.length} finding(s) in client bundle:`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line} [${f.rule}] ${f.snippet}`);
  }
  process.exit(1);
}

console.log(`✓ Client-bundle secret audit passed (${relPaths.length} files scanned).`);

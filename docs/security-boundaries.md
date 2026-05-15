# Security Boundaries

This document gives the expanded security reference for contributors.

## Secrets

Never commit credentials, API keys, root keys, production macaroons, or `.env`
files. Verify staged files before every commit.

## Bearer Credentials

Macaroons and preimages must not be logged at info level. Middleware logging
redaction lives in `packages/middleware/src/logger.ts`.

## Constant-Time Comparison

Server verification paths require constant-time comparison for signature equality
and payment-hash equality. Use `crypto.timingSafeEqual` server-side. Browser
code uses a `Uint8Array`-native helper from `@boltwall/internal`.

## TLS

Documented deployment paths require TLS. Examples that omit TLS must say so
clearly.

## Invoice Amount Verification

Middleware must verify the bolt11 amount matches the configured price. Skipping
this is a security bug.

## Unknown Caveats

Per the L402 spec, unknown caveats are skipped when no satisfier matches. The
middleware must declare and verify the known caveats it depends on. Never rely on
unknown caveats failing closed.

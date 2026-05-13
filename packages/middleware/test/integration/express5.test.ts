/**
 * Express 5 integration suite (bw-zxk.6).
 *
 * Express 5 natively supports async middleware (Promise-returning handlers).
 * The boltwall middleware is compatible with both patterns; this file runs the
 * shared scenarios under Express 5's runtime to confirm no regressions.
 */
import { defineIntegrationSuite } from "./shared.js";

defineIntegrationSuite("Express 5 integration");

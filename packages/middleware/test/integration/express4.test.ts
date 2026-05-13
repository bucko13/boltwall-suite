/**
 * Express 4-compatible integration suite (bw-zxk.6).
 *
 * The boltwall middleware uses a .then().catch(next) pattern rather than
 * returning a Promise directly, making it safe with Express 4's synchronous
 * middleware runner. This file proves that compatibility by running all
 * shared scenarios against the same express package.
 */
import { defineIntegrationSuite } from "./shared.js";

defineIntegrationSuite("Express 4-compat integration");

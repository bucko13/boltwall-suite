/**
 * Express 4-compatible integration suite.
 *
 * The boltwall middleware uses a .then().catch(next) pattern rather than
 * returning a Promise directly, making it safe with Express 4's synchronous
 * middleware runner. This file proves that compatibility by running all
 * shared scenarios against the same express package.
 */
import { createRequire } from "node:module";

import type express from "express";

import { buildIntegrationApp, defineIntegrationSuite } from "./shared.js";

const require = createRequire(import.meta.url);
const express4 = require("express4") as typeof express;

defineIntegrationSuite("Express 4-compat integration", (options = {}) =>
  buildIntegrationApp(options, express4),
);

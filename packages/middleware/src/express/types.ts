import type { L402RequestContext } from "../core/types.js";

// Module augmentation: makes req.l402 discoverable in IDE autocomplete.
declare module "express" {
  interface Request {
    l402?: L402RequestContext;
  }
}

export type {};

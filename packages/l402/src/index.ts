export {
  buildAuthenticateHeaders,
  type AuthenticateHeaderCompatibility,
  type BuildAuthenticateHeadersArgs,
} from "./build-authenticate-headers";

export {
  buildAuthorizationHeader,
  type BuildAuthorizationHeaderArgs,
} from "./build-authorization-header";

export {
  Caveat,
  capabilitiesCaveat,
  constraintCaveat,
  expirationCaveat,
  ipCaveat,
  originCaveat,
  parseCaveat,
  routeCaveat,
  serializeCaveat,
  servicesCaveat,
  validUntil,
  type CaveatComparator,
} from "./caveats";

export { decodeIdentifier, type MacaroonIdentifierV0 } from "./decode-identifier";

export { decodeBolt11Invoice, type Bolt11Network, type DecodedInvoice } from "./decode-invoice";

export {
  L402,
  type L402AuthenticateHeadersOptions,
  type L402ChallengeOptions,
  type L402Options,
  type L402TokenOptions,
  type L402VerifyOptions,
} from "./l402";

export {
  inspectMacaroon,
  type InspectedMacaroonCaveat,
  type MacaroonInspection,
} from "./inspect-macaroon";

export { mintMacaroon, type MintMacaroonArgs } from "./mint-macaroon";

export {
  parseAuthenticateHeader,
  type L402ChallengeFields,
  type L402Scheme,
} from "./parse-authenticate-header";

export {
  parseAuthorizationHeader,
  type L402CredentialFields,
  type ParseAuthorizationHeaderOptions,
} from "./parse-authorization-header";

export { InMemoryRootKeyStore, type RootKeyStore } from "./root-key-store";

export { verifyPreimage, type VerifyPreimageArgs } from "./verify-preimage";

export {
  verifyMacaroon,
  type VerifyMacaroonArgs,
  type VerifyMacaroonResult,
} from "./verify-macaroon";

export {
  VerificationFailurePrefix,
  VerificationFailureReason,
  type VerificationFailureReasonValue,
} from "./verification-failure";

export {
  capabilitiesSatisfier,
  expirationSatisfier,
  ipSatisfier,
  originSatisfier,
  routeSatisfier,
  servicesSatisfier,
  validUntilSatisfier,
  type CaveatContext,
  type CaveatSatisfier,
} from "./satisfiers";

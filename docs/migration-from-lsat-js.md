# Migration from lsat-js

Moving from `Tierion/lsat-js`? Start by replacing the `Lsat` object workflow
with the `L402` class. The method names are intentionally familiar, but the new
API uses L402-native defaults, browser-safe `Uint8Array` values, and `bigint`
millisatoshi amounts where money crosses package boundaries.

## Quick Changes

### Parse a challenge and build the paid retry

```ts
// lsat-js
const lsat = Lsat.fromChallenge(wwwAuthenticate);
lsat.setPreimage(preimage);
const authorization = lsat.toToken();
```

```ts
// @boltwall/l402
import { L402 } from "@boltwall/l402";

const l402 = L402.fromChallenge(wwwAuthenticate);
l402.setPreimage(preimage);
const authorization = l402.toAuthorizationHeader();
```

`toAuthorizationHeader()` emits the current `L402` scheme by default. Use
`toAuthorizationHeader({ legacy: true })` only when you must send a legacy
`LSAT` credential.

### Parse an existing token

```ts
import { L402 } from "@boltwall/l402";

const l402 = L402.fromToken(authorizationHeader);

if (!l402.isPending() && l402.isSatisfied()) {
  const caveats = l402.getCaveats();
  const paymentHash = l402.paymentHashHex;
}
```

`L402.fromToken(...)` accepts both `LSAT` and `L402` credentials. Pending
trailing-colon tokens are accepted for migration state, but `toToken()` and
`toAuthorizationHeader()` require a preimage so they cannot be mistaken for a
paid retry credential.

### Create and read caveats

```ts
import { Caveat, L402, validUntil } from "@boltwall/l402";

const l402 = L402.fromMacaroon(macaroon);

l402.addFirstPartyCaveat(new Caveat("tenant", "acme"));
l402.addFirstPartyCaveat(validUntil({ iso: "2026-01-01T00:00:00.000Z" }));

// Raw encoded caveat strings are still accepted for compatibility.
l402.addFirstPartyCaveat("expiration<1577228778197");

const encoded = Caveat.decode("role=admin").encode();
```

Standard L402 caveat helpers emit `condition=value`. The `Caveat` class also
preserves legacy comparator caveats (`<`, `=`, `>`) at the object and macaroon
layer.

### Migrate expiration checks

Use `valid-until=<ISO-8601>` for new credentials:

```ts
import { validUntil } from "@boltwall/l402";

l402.addFirstPartyCaveat(validUntil({ seconds: 300 }));
const expired = l402.isExpired();
```

Existing LSAT-style `expiration=<unix-ms>` macaroons still verify through
`expirationCaveat` and `expirationSatisfier`, but new code should prefer
`valid-until`.

### Replace `Buffer` and amount fields

Public `@boltwall/l402` APIs use `Uint8Array` and strings instead of `Buffer`.
For example, decode a macaroon identifier explicitly:

```ts
import { Identifier } from "@boltwall/l402";

const identifier = Identifier.fromMacaroon(l402.macaroon);
```

Money amounts use `bigint` millisatoshis (`amountMsat`) rather than `number`
satoshis. JSON and HTTP payloads serialize bigint values as decimal strings; see
[`docs/numeric-strategy.md`](./numeric-strategy.md) for the boundary rules.

## Important Behavior Differences

| Legacy behavior                                               | Current behavior                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LSAT` is the only scheme emitted by class serializers.       | New APIs emit `L402` by default. Legacy `LSAT` emission is explicit via `{ legacy: true }`. L402 protocol-specification.md section 10 requires accepting both schemes and recommends dual challenge emission for servers.                                          |
| `Buffer` appears in public types such as `IdentifierOptions`. | Public APIs use `Uint8Array` and `string`. Use `Uint8Array` or `string` replacements for those call shapes.                                                                                                                                                        |
| Amount fields are `number` sats.                              | Public amount fields use `bigint` millisatoshis per `docs/numeric-strategy.md`. Legacy numeric sats fields are migration/display compatibility only.                                                                                                               |
| Preimage verification compares hex strings directly.          | Verification uses normalized bytes and constant-time comparison on payment hashes. L402 protocol-specification.md section 6 and macaroon-spec.md Verification require `sha256(preimage) == payment_hash`; constant-time checks are required on verification paths. |
| Unknown caveats without satisfiers are ignored.               | Preserve this behavior. L402 macaroon-spec.md Verification says unknown caveats MUST be skipped, not rejected.                                                                                                                                                     |

## Detailed API Map

### Object workflow

| lsat-js                                 | @boltwall/l402                                         | Notes                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Lsat`                                  | `L402`                                                 | Primary migration path. Defaults to current `L402` scheme emission.                                                                               |
| `new Lsat(options)`                     | `new L402(options)` or static constructors             | Use `Uint8Array` or hex strings instead of `Buffer`.                                                                                              |
| `Lsat.fromHeader(header)`               | `L402.fromHeader(header)`                              | Accepts `LSAT`, `L402`, repeated headers, folded headers, and identical dual challenges. Conflicting dual challenges throw `ambiguous-challenge`. |
| `Lsat.fromChallenge(challenge)`         | `L402.fromChallenge(challenge)`                        | Accepts raw challenge fields or full `LSAT`/`L402` challenge strings.                                                                             |
| `Lsat.fromToken(token, invoice?)`       | `L402.fromToken(token, invoice?)`                      | Accepts legacy `LSAT`, current `L402`, pending trailing-colon tokens, and multi-macaroon credentials.                                             |
| `Lsat.fromMacaroon(macaroon, invoice?)` | `L402.fromMacaroon(macaroon, invoice?)`                | Decodes the v0 identifier so payment-hash helpers work.                                                                                           |
| `Lsat#toToken()`                        | `L402#toToken()` or `L402#toAuthorizationHeader()`     | Emits `L402` by default; pass `{ legacy: true }` only for LSAT output.                                                                            |
| `Lsat#toChallenge()`                    | `L402#toChallenge()` or `L402#toAuthenticateHeaders()` | `toAuthenticateHeaders()` emits dual LSAT-first/L402-second server challenges by default.                                                         |
| `Lsat#setPreimage(preimage)`            | `L402#setPreimage(preimage)`                           | Validates 32-byte hex and checks the preimage against the payment hash when known.                                                                |
| `Lsat#isPending()`                      | `L402#isPending()`                                     | Same meaning: no preimage is attached.                                                                                                            |
| `Lsat#isSatisfied()`                    | `L402#isSatisfied()`                                   | Uses the current preimage verification path.                                                                                                      |
| `Lsat#isExpired()`                      | `L402#isExpired()`                                     | Checks `valid-until` plus imported `expiration` caveats.                                                                                          |
| `Lsat#toJSON()`                         | `L402#toJSON()`                                        | JSON-safe inspection; payment preimage is omitted.                                                                                                |

### Macaroon and invoice inspection

| lsat-js                    | @boltwall/l402                                   | Notes                                                                                |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `Lsat#getMacaroon()`       | `L402#inspectMacaroon()` or `L402#macaroon`      | Use inspection for JSON-safe structure, or `macaroon` for the raw base64 credential. |
| `Lsat#getCaveats()`        | `L402#getCaveats()`                              | Returns `Caveat[]`.                                                                  |
| `Lsat#addInvoice(invoice)` | `L402#addInvoice(invoice)`                       | Attaches the raw BOLT 11 invoice string.                                             |
| `Lsat#invoiceAmount`       | `decodeBolt11Invoice(invoice).amountMsat`        | Amounts are `bigint` millisatoshis.                                                  |
| `Lsat#id`                  | `Identifier.fromMacaroon(l402.macaroon).tokenId` | Identifier fields are explicit bytes, not legacy encoded strings.                    |
| `IdentifierOptions`        | `MacaroonIdentifierV0`                           | Uses `Uint8Array`; no public `Buffer` fields.                                        |

### Caveats and satisfiers

| lsat-js                                       | @boltwall/l402                                     | Notes                                                                                                        |
| --------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Caveat`                                      | `Caveat`                                           | Runtime class with `condition`, `value`, comparator support, `encode()`, and `Caveat.decode(...)`.           |
| `new Caveat({ condition, value, comp })`      | `new Caveat(condition, value, comparator?)`        | Use a raw encoded string with `addFirstPartyCaveat(...)` when preserving exact legacy caveat text is easier. |
| `Caveat#encode()`                             | `Caveat#encode()`                                  | Emits `condition=value`, `condition<value`, or `condition>value`.                                            |
| `Caveat.decode(c)`                            | `Caveat.decode(c)`                                 | Decodes `=`, `<`, and `>` comparators.                                                                       |
| `hasCaveat(rawMac, caveat)`                   | `L402.fromMacaroon(rawMac).getCaveats().some(...)` | Uses normal array inspection.                                                                                |
| `getCaveatsFromMacaroon(rawMac)`              | `L402.fromMacaroon(rawMac).getCaveats()`           | Malformed caveat bytes remain visible through `inspectMacaroon(...)`.                                        |
| `verifyCaveats(caveats, satisfiers, options)` | `verifyCaveats(caveats, satisfiers, context)`      | Keeps unknown-caveat skip and attenuation checks.                                                            |
| `Satisfier`                                   | `CaveatSatisfier`                                  | Uses typed `satisfyPrevious` and `satisfyFinal` callbacks.                                                   |
| `createServicesSatisfier(...)`                | `servicesSatisfier(...)`                           | Enforces service attenuation.                                                                                |
| `createCapabilitiesSatisfier(...)`            | `capabilitiesSatisfier(...)`                       | Enforces capability attenuation.                                                                             |
| `expirationSatisfier`                         | `expirationSatisfier` or `validUntilSatisfier`     | `expiration` remains for imported LSAT macaroons; prefer `valid-until` for new credentials.                  |

### Service helpers and internals

| lsat-js                                           | @boltwall/l402                           | Notes                                                              |
| ------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `Service` class                                   | plain `{ name: string; tier: number }`   | Helpers accept plain service objects.                              |
| `createNewCapabilitiesCaveat(...)`                | `capabilitiesCaveat(...)`                | Builds `<service>_capabilities=...`.                               |
| `encodeServicesCaveatValue(...)`                  | `servicesCaveat(...)`                    | Builds the full `services=name:tier,...` caveat.                   |
| service constants and value decoders              | helper factories plus `parseCaveat(...)` | Constants and structured service-value parsers are not public API. |
| `parseChallengePart(...)`                         | `L402.fromChallenge(...)`                | Header parsing is handled by `L402`.                               |
| `getRawMacaroon(...)`, `MacaroonClass`            | no public equivalent                     | Macaroon codec internals are not public API.                       |
| `isHex(...)`, `stringToBytes(...)`, `utf8Encoder` | no public equivalent                     | Generic byte helpers are internal.                                 |
| `decode(req)`, `getIdFromRequest(req)`            | `decodeBolt11Invoice(invoice)`           | Invoice decoding returns structured data.                          |

## Compatibility Summary

The useful legacy surface is the object workflow: parse challenge or token,
inspect macaroon/invoice/payment hash, set a preimage, serialize a paid retry,
and evaluate caveats with satisfiers. That workflow continues under the `L402`
class facade.

The legacy implementation details are not carried forward: public `Buffer`
types, `bufio.Struct` inheritance, wrapped `macaroon` library JSON classes,
`number` sat amounts, mixed return types such as `string | boolean | Error`, and
LSAT-only default emission.

## Worked Example: A Custom Caveat Satisfier

`@boltwall/l402` ships satisfiers for the standard caveats (`servicesSatisfier`,
`originSatisfier`, `routeSatisfier`, and so on). To enforce a caveat the library
does not cover, build the caveat, implement a `CaveatSatisfier`, and pass it to
`verifyMacaroon`. The example below binds a credential to a single tenant id.

```ts
import {
  Caveat,
  mintMacaroon,
  verifyMacaroon,
  type CaveatSatisfier,
  type MacaroonIdentifierV0,
} from "@boltwall/l402";

// 1. Build and attach the caveat when minting (or via L402#addFirstPartyCaveat).
//    Standard caveats use condition=value; this one is "tenant=<id>".
const tenantCaveat = new Caveat("tenant", "acme");

const identifier: MacaroonIdentifierV0 = {
  version: 0,
  paymentHash, // 32 bytes
  tokenId, // 32 bytes
};

const macaroon = mintMacaroon({
  rootKey, // secret 32 bytes, server-side
  identifier,
  caveats: [tenantCaveat],
});

// 2. Implement a satisfier for that condition.
//    satisfyPrevious enforces attenuation between repeated caveats; here a
//    later caveat may only repeat the same tenant. satisfyFinal checks the
//    request context (passed through verifyMacaroon's `context`).
function tenantSatisfier(expectedTenant: string): CaveatSatisfier {
  return {
    condition: "tenant",
    satisfyPrevious(previous, next) {
      return previous.value === next.value;
    },
    satisfyFinal(caveat) {
      return caveat.value === expectedTenant;
    },
  };
}

// 3. Pass the satisfier (alongside any standard ones) to verifyMacaroon.
const result = await verifyMacaroon({
  macaroons: [macaroon],
  preimage, // 32-byte hex or bytes
  rootKeyStore, // server-side RootKeyStore
  satisfiers: [tenantSatisfier("acme")],
  context: { request },
});

if (result.ok) {
  // authorized
} else {
  // result.reason carries the failure code, e.g. "caveat-rejected:tenant"
}
```

Caveats whose condition has no matching satisfier are skipped, not rejected, per
L402 macaroon-spec.md §Verification. Declare every caveat you depend on as an
explicit satisfier; set `strictUnknownCaveats: true` only when you want unknown
conditions to fail closed.

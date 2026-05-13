# Dependency Policy

Prefer `@boltwall/internal` over external dependencies when the functionality
fits in roughly 200 lines of clear TypeScript with good unit tests.

## Decision Rule

Before adding an external package, ask whether the same functionality can be a
small internal utility. If yes, build it in `@boltwall/internal` with positive
and negative tests.

The threshold is a rough complexity boundary where maintaining a small internal
implementation is cheaper than accepting transitive dependencies, supply-chain
surface, license review, and version drift.

## Provenance Is Not Trust

SLSA provenance and package attestations are integrity signals, not safety
signals. They can show where, when, and how an artifact was produced, but they
do not prove that the producer, release workflow, maintainer account, or build
step was uncompromised. Treat a valid attestation as evidence to verify against
expectations, not as approval to skip dependency review.

The Mini Shai-Hulud campaign is the concrete failure mode this policy is meant
to cover: malicious package versions were reported with valid provenance because
attackers abused legitimate release paths. The package was traceable to a
pipeline, but the pipeline was no longer trustworthy enough to bless the code.

## Usually Internal

- Base64url encode/decode helpers.
- Hex and `Uint8Array` converters.
- Constant-time byte-array comparison.
- Small parsers, tokenizers, and validators.
- Header grammar utilities.

## Usually External

- Cryptographic primitives, such as `@noble/hashes` or WebCrypto.
- Well-established protocol implementations, such as BOLT 11 decoders or
  macaroon binary format.
- Large parsers.
- Framework integrations.

## Inbound Dependency Vetting

Before adding a dependency, record the review in the change note or task thread:

- Maintainer identity: npm owner, GitHub organization, project history, and
  whether ownership changed recently.
- Package health: current documentation, recent releases, open security issues,
  and whether the release came from the expected repository and workflow.
- Risk scanners: Socket.dev, OSV, GitHub advisory data, or an equivalent source
  for malware, typosquat, install-script, and maintenance warnings.
- Transitive surface: direct and transitive dependency count, native code,
  binary downloads, optional dependencies, and license compatibility.
- Lifecycle scripts: `preinstall`, `install`, `postinstall`, `prepare`, and any
  script that downloads code, runs shells, or executes package-manager hooks.
- Runtime access: whether the dependency needs filesystem, network, process,
  child-process, environment-variable, credential, or CI access.
- Alternatives: why a small `@boltwall/internal` utility is not the better fit.

## Change Record

Every external dependency addition must justify the choice:

```text
I considered building this in @boltwall/internal but <reason>.
```

When unsure of a third-party API, look up current documentation rather than
guessing.

## Install-Time Defenses

Two controls are configured in `bunfig.toml` at the repo root and apply to
every `bun install` run — local development and CI alike:

**Minimum release age (`install.minimumReleaseAge = 604800`)** — Bun rejects
any package version published fewer than 7 days ago. Most fast-turnaround
supply chain attacks (credential theft → poisoned publish) are detected and
removed by the community within hours; the 7-day gate ensures those versions
never land. Applies uniformly to all external dependencies across every
workspace subpackage.

To allow an urgent patch younger than 7 days, add it temporarily:
```toml
[install]
minimumReleaseAgeExcludes = ["vulnerable-package"]
```
Remove the exclusion once the version ages past the threshold.

**Lifecycle script blocking (`install.ignoreScripts = true`)** — Bun skips all
`preinstall` / `install` / `postinstall` / `prepare` hooks for every package.
This mirrors the `--ignore-scripts` flag already in CI workflows and closes the
gap for local installs. No workspace package in this repo declares lifecycle
scripts; platform binaries (esbuild, Playwright) use optional-deps instead.

## Threat References

- [SLSA Build Provenance](https://slsa.dev/spec/v1.2/build-provenance)
  documents provenance as a record of how an artifact was produced so consumers
  can verify it against expectations.
- [The Hacker News: SAP-related npm packages compromised by Mini Shai-Hulud](https://thehackernews.com/2026/04/sap-npm-packages-compromised-by-mini.html)
  summarizes install-time credential theft and self-propagation behavior.
- [Wiz: Mini Shai-Hulud supply-chain SAP npm campaign](https://www.wiz.io/blog/mini-shai-hulud-supply-chain-sap-npm)
  tracks TeamPCP attribution, credential targets, and exfiltration paths.
- [StepSecurity: Shai-Hulud self-replicating npm worm](https://www.stepsecurity.io/blog/ctrl-tinycolor-and-40-npm-packages-compromised)
  documents the broader npm worm pattern that informs this checklist.

"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

import { BigBlob } from "../../components/ui/big-blob";
import { CaveatPill } from "../../components/ui/caveat-pill";
import { Cell } from "../../components/ui/cell";
import { Chip } from "../../components/ui/chip";
import { CodeSnippet } from "../../components/ui/code-snippet";
import { CodeStrip } from "../../components/ui/code-strip";
import { HeaderRow } from "../../components/ui/header-row";
import { LogoBeaker } from "../../components/ui/logo-beaker";
import { MacaroonStripe, type MacaroonSegments } from "../../components/ui/macaroon-stripe";
import { StatusPill, type StatusPillState } from "../../components/ui/status-pill";
import { TruncMiddle } from "../../components/ui/trunc-middle";
import { ViewModeToggle } from "../../components/ui/view-mode-toggle";

const SAMPLE_MACAROON =
  "MDAxYWxvY2F0aW9uIGxzYXQuYm9sdHdhbGwuaW8KMDAyNGlkZW50aWZpZXIgYjEyM2YwMDljYWZlYmFiZTU1NTU2NjY2N2YwMQowMDIzY2lkIGV4cGlyZXM9MjAyNi0wMS0wMVQwMDowMDowMFoKMDAxYWNpZCBpcD0xMC4wLjAuMQowMDJmc2lnbmF0dXJlIDdkOWMxMzMyZmFhZGRlY2FmZTk5OTljYWZlZGVhZGJlZWY1NTY2NzcwMDhkCg";
const SAMPLE_TOKEN_HASH = "b123f009cafebabe55556666fffeeeeddccc99887766554433221100aabbccdd";
const SAMPLE_PREIMAGE = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

const sectionLabel: CSSProperties = {
  fontSize: "var(--size-11)",
  textTransform: "uppercase",
  letterSpacing: 0.6,
  fontWeight: 500,
  color: "var(--color-dim)",
  marginBottom: 12,
};

const sectionTitle: CSSProperties = {
  fontSize: "var(--size-20)",
  fontWeight: 600,
  letterSpacing: -0.56,
  marginBottom: 16,
  color: "var(--color-text)",
};

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section style={{ margin: "48px 0" }}>
      <div style={sectionLabel}>{kicker}</div>
      <h2 style={sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function PrimitiveRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: 24,
        padding: "16px 0",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div>
        <div
          style={{
            fontSize: "var(--size-13)",
            color: "var(--color-text)",
            fontWeight: 500,
          }}
        >
          {label}
        </div>
        {description ? (
          <div
            style={{
              fontSize: "var(--size-12)",
              color: "var(--color-dim)",
              marginTop: 4,
            }}
          >
            {description}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Fixture from @boltwall/test-fixtures macaroonCodecFixtures[1]
const DEMO_SEGMENTS: MacaroonSegments = {
  identifier: hexToBytes(
    "0000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  ),
  location: "lsat.boltwall.io",
  caveats: [
    {
      raw: hexToBytes("73657276696365733d706f6b656465783a30"),
      condition: "services",
      value: "pokedex:0",
    },
    {
      raw: hexToBytes("706f6b656465785f6361706162696c69746965733d72656164"),
      condition: "pokedex_capabilities",
      value: "read",
    },
  ],
  signature: hexToBytes("7d9c1332faaddecafe9999cafedeadbeef5566770088aabb1122ccdd33440055"),
};

const STATUS_STATES: StatusPillState[] = ["idle", "ready", "running", "pass", "fail", "warn"];

export default function DesignPage() {
  return (
    <main
      style={{
        maxWidth: 1080,
        margin: "0 auto",
        padding: "32px 24px 80px",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <div style={sectionLabel}>design preview</div>
        <h1
          style={{
            fontSize: "var(--size-28)",
            fontWeight: 600,
            letterSpacing: -0.9,
            marginBottom: 4,
            color: "var(--color-text)",
          }}
        >
          Primitives and composition
        </h1>
        <p
          style={{
            color: "var(--color-dim)",
            fontSize: "var(--size-13)",
          }}
        >
          Every primitive in the design system, rendered in the active theme. Toggle theme from the
          nav.
        </p>
      </header>

      <Section kicker="01" title="Color tokens">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 8,
          }}
        >
          {[
            ["surface", "var(--color-surface)"],
            ["surface-alt", "var(--color-surface-alt)"],
            ["border", "var(--color-border)"],
            ["text", "var(--color-text)"],
            ["dim", "var(--color-dim)"],
            ["primary", "var(--color-primary)"],
            ["accent", "var(--color-accent)"],
            ["accent-soft", "var(--color-accent-soft)"],
            ["warn", "var(--color-warn)"],
            ["warn-soft", "var(--color-warn-soft)"],
            ["danger", "var(--color-danger)"],
            ["danger-soft", "var(--color-danger-soft)"],
          ].map(([name, value]) => (
            <div
              key={name}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 4,
                background: "var(--color-surface)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 56,
                  background: value,
                  borderBottom: "1px solid var(--color-border)",
                }}
              />
              <div
                style={{
                  padding: "6px 10px",
                  fontSize: "var(--size-11)",
                  fontFamily:
                    "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
                  color: "var(--color-dim)",
                }}
              >
                {name}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section kicker="02" title="Primitives">
        <PrimitiveRow label="LogoBeaker" description="Hand-authored SVG, currentColor.">
          <span style={{ color: "var(--color-text)" }}>
            <LogoBeaker size={24} />
          </span>
          <span style={{ color: "var(--color-primary)" }}>
            <LogoBeaker size={32} />
          </span>
          <span style={{ color: "var(--color-dim)" }}>
            <LogoBeaker size={28} />
          </span>
        </PrimitiveRow>

        <PrimitiveRow label="StatusPill" description="6 states, lives in Cell header.">
          {STATUS_STATES.map((s) => (
            <StatusPill key={s} state={s}>
              {s}
            </StatusPill>
          ))}
        </PrimitiveRow>

        <PrimitiveRow label="CaveatPill" description="Caveat key=value, three satisfier states.">
          <CaveatPill state="matched">expires=2026-01-01T00:00:00Z</CaveatPill>
          <CaveatPill state="unsatisfied">ip=10.0.0.1</CaveatPill>
          <CaveatPill state="rejected">method=POST</CaveatPill>
        </PrimitiveRow>

        <PrimitiveRow label="Chip" description="Neutral kicker labels.">
          <Chip>L402</Chip>
          <Chip>LSAT</Chip>
          <Chip>mainnet</Chip>
          <Chip>scheme=L402</Chip>
        </PrimitiveRow>

        <PrimitiveRow label="ViewModeToggle" description="raw | json | code segmented control.">
          <ViewModeToggle />
          <ViewModeToggle modes={["raw", "json"]} />
        </PrimitiveRow>

        <PrimitiveRow label="TruncMiddle" description="Fixed-width identifier with hover tooltip.">
          <TruncMiddle value={SAMPLE_TOKEN_HASH} />
          <TruncMiddle value={SAMPLE_PREIMAGE} head={8} tail={8} />
        </PrimitiveRow>

        <PrimitiveRow label="BigBlob" description="Long mono value, copy + wrap toggles.">
          <div style={{ flex: 1, minWidth: 320 }}>
            <BigBlob value={SAMPLE_MACAROON} />
          </div>
        </PrimitiveRow>

        <PrimitiveRow label="CodeStrip" description="Visible when Cell view = code.">
          <div style={{ flex: 1, minWidth: 320 }}>
            <CodeStrip>
              <span style={{ color: "var(--color-dim)" }}>
                {"// rendering preview — production highlighting uses Prism"}
              </span>
              {"\n"}
              <span style={{ color: "var(--color-primary)" }}>const</span> token ={" "}
              <span style={{ color: "var(--color-accent)" }}>await</span> client.
              <span style={{ color: "var(--color-text)" }}>build</span>({"{"}
              {"\n  "}preimage,{"\n  "}macaroon,{"\n"}
              {"}"});
            </CodeStrip>
          </div>
        </PrimitiveRow>

        <PrimitiveRow label="HeaderRow" description="Title · subtitle · trailing slot.">
          <div
            style={{
              flex: 1,
              minWidth: 320,
              border: "1px solid var(--color-border)",
            }}
          >
            <HeaderRow
              title="Parse a token"
              subtitle="raw · base64"
              trailing={
                <>
                  <ViewModeToggle />
                  <StatusPill state="ready">ready</StatusPill>
                </>
              }
            />
          </div>
        </PrimitiveRow>

        <PrimitiveRow label="Cell" description="The only top-level container.">
          <div style={{ flex: 1, minWidth: 320 }}>
            <Cell
              header={
                <HeaderRow
                  title="Inspect identifier"
                  subtitle="32 bytes"
                  trailing={<StatusPill state="pass">parsed</StatusPill>}
                />
              }
              body={
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: "var(--size-12)",
                      color: "var(--color-dim)",
                    }}
                  >
                    Identifier
                  </div>
                  <TruncMiddle value={SAMPLE_TOKEN_HASH} head={10} tail={10} />
                </div>
              }
            />
          </div>
        </PrimitiveRow>
      </Section>

      <Section kicker="03" title="MacaroonStripe">
        <p style={{ color: "var(--color-dim)", fontSize: "var(--size-12)", marginBottom: 16 }}>
          4-segment macaroon visualization. Click a segment to reveal raw bytes.
        </p>
        <MacaroonStripe segments={DEMO_SEGMENTS} />
      </Section>

      <Section kicker="04" title="CodeSnippet">
        <p style={{ color: "var(--color-dim)", fontSize: "var(--size-12)", marginBottom: 16 }}>
          Live-updating syntax-highlighted snippet. Type in the field to see the template update.
        </p>
        <CodeSnippetDemo />
      </Section>

      <Section kicker="05" title="Composite — Validate a token">
        <ValidateComposite />
      </Section>
    </main>
  );
}

const SNIPPET_TEMPLATE = `import { L402 } from "@boltwall/l402";

// Build an L402 Authorization header
const token = new L402({
  macaroons: "{{macaroon}}",
  paymentPreimage: "{{preimage}}",
});
const header = token.toAuthorizationHeader();`;

function CodeSnippetDemo() {
  const [macaroon, setMacaroon] = useState("AgEDbHRu…");
  const [preimage, setPreimage] = useState("0001020304…");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 }}>
          <span style={{ fontSize: "var(--size-12)", color: "var(--color-dim)" }}>macaroon</span>
          <input
            data-testid="code-snippet-input"
            value={macaroon}
            onChange={(e) => setMacaroon(e.target.value)}
            spellCheck={false}
            style={{
              padding: "6px 10px",
              background: "var(--color-surface-alt)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              fontSize: "var(--size-13)",
              color: "var(--color-text)",
              fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', ui-monospace, monospace",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 }}>
          <span style={{ fontSize: "var(--size-12)", color: "var(--color-dim)" }}>preimage</span>
          <input
            value={preimage}
            onChange={(e) => setPreimage(e.target.value)}
            spellCheck={false}
            style={{
              padding: "6px 10px",
              background: "var(--color-surface-alt)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              fontSize: "var(--size-13)",
              color: "var(--color-text)",
              fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', ui-monospace, monospace",
            }}
          />
        </label>
      </div>
      <CodeSnippet
        language="typescript"
        template={SNIPPET_TEMPLATE}
        values={{ macaroon, preimage }}
      />
    </div>
  );
}

function ValidateComposite() {
  return (
    <Cell
      header={
        <HeaderRow
          title="Validate a token"
          subtitle="signature · expiration · caveats"
          trailing={
            <>
              <ViewModeToggle />
              <StatusPill state="pass">3 / 5 passed</StatusPill>
            </>
          }
        />
      }
      body={
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <FieldStack
            label="Signing key"
            hint="HMAC root key for this issuer (hex)."
            mono
            value="0c8b9f17 33e2 4a 1c b6 …"
            chips={[<Chip key="hex">hex</Chip>, <Chip key="32b">32 bytes</Chip>]}
          />

          <FieldStack
            label="Token"
            hint="Base64 macaroon to validate."
            value={SAMPLE_MACAROON}
            blob
            chips={[<Chip key="b64">base64</Chip>, <Chip key="m">macaroon</Chip>]}
          />

          <FieldStack
            label="Preimage"
            hint="Payment preimage that satisfies the invoice (hex)."
            mono
            value={SAMPLE_PREIMAGE}
            chips={[<Chip key="hex">hex</Chip>, <Chip key="32b">32 bytes</Chip>]}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <ActionButton variant="primary">Run checks</ActionButton>
            <ActionButton>Reset</ActionButton>
            <ActionButton>Copy URL</ActionButton>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              borderTop: "1px solid var(--color-border)",
              paddingTop: 12,
            }}
          >
            <div
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-dim)",
                marginBottom: 4,
              }}
            >
              Checks
            </div>
            <CheckRow
              state="pass"
              label="Signature verified"
              detail="HMAC-SHA256 over canonical bytes"
            />
            <CheckRow
              state="pass"
              label="Preimage matches payment hash"
              detail="sha256(preimage) == payment_hash"
            />
            <CheckRow state="pass" label="Not expired" detail="expires=2026-01-01T00:00:00Z" />
            <CheckRow state="warn" label="Token size within limit" detail="612 / 1024 bytes" />
            <CheckRow
              state="fail"
              label="All caveats satisfied"
              detail="1 caveat unsatisfied: ip=10.0.0.1"
            />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              borderTop: "1px solid var(--color-border)",
              paddingTop: 12,
            }}
          >
            <div
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-dim)",
              }}
            >
              Caveats
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <CaveatPill state="matched">expires=2026-01-01T00:00:00Z</CaveatPill>
              <CaveatPill state="unsatisfied">ip=10.0.0.1</CaveatPill>
              <CaveatPill state="matched">method=GET</CaveatPill>
              <CaveatPill state="matched">tier=pro</CaveatPill>
            </div>
          </div>
        </div>
      }
    />
  );
}

function FieldStack({
  label,
  hint,
  value,
  mono = false,
  blob = false,
  chips,
}: {
  label: string;
  hint?: string;
  value: string;
  mono?: boolean;
  blob?: boolean;
  chips?: ReactNode[];
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: "var(--size-12)",
            color: "var(--color-text)",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        {chips ? <span style={{ display: "inline-flex", gap: 4 }}>{chips}</span> : null}
      </span>
      {hint ? (
        <span
          style={{
            fontSize: "var(--size-11)",
            color: "var(--color-dim)",
          }}
        >
          {hint}
        </span>
      ) : null}
      {blob ? (
        <BigBlob value={value} />
      ) : (
        <input
          defaultValue={value}
          spellCheck={false}
          style={{
            padding: "8px 10px",
            background: "var(--color-surface-alt)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            fontFamily: mono
              ? "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace"
              : undefined,
            fontSize: "var(--size-13-5)",
            color: "var(--color-text)",
          }}
        />
      )}
    </label>
  );
}

function ActionButton({
  variant = "default",
  children,
}: {
  variant?: "default" | "primary";
  children: ReactNode;
}) {
  const isPrimary = variant === "primary";
  return (
    <button
      type="button"
      style={{
        padding: "6px 12px",
        borderRadius: 4,
        fontSize: "var(--size-13)",
        fontWeight: 500,
        background: isPrimary ? "var(--color-primary)" : "var(--color-surface)",
        color: isPrimary ? "var(--color-surface)" : "var(--color-text)",
        border: isPrimary ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
      }}
    >
      {children}
    </button>
  );
}

function CheckRow({
  state,
  label,
  detail,
}: {
  state: StatusPillState;
  label: string;
  detail: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 12,
        padding: "6px 0",
      }}
    >
      <StatusPill state={state}>{state}</StatusPill>
      <div>
        <div
          style={{
            fontSize: "var(--size-13)",
            color: "var(--color-text)",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: "var(--size-12)",
            color: "var(--color-dim)",
            fontFamily:
              "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
          }}
        >
          {detail}
        </div>
      </div>
    </div>
  );
}

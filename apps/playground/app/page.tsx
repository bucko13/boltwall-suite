import Link from "next/link";

const PANELS = [
  {
    slug: "signing-key",
    label: "Signing Key",
    description: "Generate or paste a 32-byte root key used to mint macaroons.",
  },
  {
    slug: "from-invoice",
    label: "Generate L402 Token",
    description: "Mint a macaroon from a root key and BOLT 11 invoice.",
  },
  {
    slug: "from-challenge",
    label: "From Challenge",
    description: "Parse a WWW-Authenticate L402 challenge header.",
  },
  {
    slug: "parse-token",
    label: "Parse Token",
    description: "Decode a base64 macaroon: identifier fields, caveats, signature.",
  },
  {
    slug: "caveats",
    label: "Caveats",
    description: "Build and inspect a caveat list with condition=value pairs.",
  },
  {
    slug: "add-expiration",
    label: "Add Expiration",
    description: "Build a valid-until caveat from a TTL in seconds.",
  },
  {
    slug: "validate",
    label: "Validate L402",
    description: "Full macaroon verification: signature + preimage + caveat checklist.",
  },
  {
    slug: "satisfy",
    label: "Satisfy L402",
    description: "Register satisfiers and check them against a token's caveats.",
  },
  {
    slug: "demo",
    label: "Demo",
    description: "WebLN wallet connect with live Lightning node info in-browser.",
  },
];

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 880,
        margin: "0 auto",
        padding: "48px 24px",
      }}
    >
      <h1
        style={{
          fontSize: "var(--size-28)",
          fontWeight: 700,
          letterSpacing: 0,
          marginBottom: 8,
          color: "var(--color-text)",
        }}
      >
        L402 Workbench
      </h1>
      <p
        style={{
          color: "var(--color-dim)",
          fontSize: "var(--size-15)",
          marginBottom: 40,
          maxWidth: 560,
        }}
      >
        Interactive browser tools for L402 macaroon minting, parsing, and verification. All
        operations run client-side with no server roundtrips.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 1,
          border: "1px solid var(--color-border)",
        }}
      >
        {PANELS.map((p) => (
          <Link
            key={p.slug}
            href={`/p/${p.slug}`}
            data-testid={`panel-link-${p.slug}`}
            style={{
              display: "block",
              padding: "20px 22px",
              background: "var(--color-surface)",
              borderRight: "1px solid var(--color-border)",
              borderBottom: "1px solid var(--color-border)",
              textDecoration: "none",
            }}
          >
            <div
              style={{
                fontSize: "var(--size-14)",
                fontWeight: 600,
                color: "var(--color-text)",
                marginBottom: 4,
              }}
            >
              {p.label}
            </div>
            <div
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-dim)",
                lineHeight: 1.5,
              }}
            >
              {p.description}
            </div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 40, display: "flex", gap: 12 }}>
        <Link
          href="/design"
          style={{
            display: "inline-block",
            padding: "8px 14px",
            background: "var(--color-surface-alt)",
            color: "var(--color-dim)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            fontSize: "var(--size-13)",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Design tokens
        </Link>
      </div>
    </main>
  );
}

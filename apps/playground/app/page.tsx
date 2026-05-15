import Link from "next/link";

const HOME_GROUPS = [
  {
    id: "generate",
    label: "Generate",
    description: "Create the key material and token used to authorize a paid request.",
    links: [
      {
        slug: "signing-key",
        label: "Signing Key",
        description: "Generate or paste a 32-byte root key.",
      },
      {
        slug: "from-invoice",
        label: "Generate Token",
        description: "Mint a macaroon from a root key and BOLT 11 invoice.",
      },
    ],
  },
  {
    id: "parse",
    label: "Parse",
    description: "Inspect incoming protocol material before deciding what to do next.",
    links: [
      {
        slug: "from-challenge",
        label: "Challenge Header",
        description: "Read a WWW-Authenticate challenge header.",
      },
      {
        slug: "parse-token",
        label: "Token",
        description: "Decode a base64 macaroon identifier, caveats, and signature.",
      },
    ],
  },
  {
    id: "caveats",
    label: "Caveats",
    description: "Add caveats, create time limits, and check satisfiers.",
    links: [{ slug: "caveats", label: "Open Caveats", description: "Build and check caveats." }],
  },
  {
    id: "validate",
    label: "Validate",
    description: "Verify signature, payment preimage, and caveats together.",
    links: [
      {
        slug: "validate",
        label: "Open Validate",
        description: "Run a full credential verification.",
      },
    ],
  },
  {
    id: "demo",
    label: "Demo",
    description: "Try the paid flow against the playground demo surface.",
    links: [{ slug: "demo", label: "Open Demo", description: "Exercise the browser demo." }],
  },
];

export default function HomePage() {
  return (
    <main
      className="home-main"
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
        className="home-panel-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 1,
          border: "1px solid var(--color-border)",
        }}
      >
        {HOME_GROUPS.map((group) => (
          <section
            key={group.id}
            data-testid={`home-group-${group.id}`}
            className="home-panel-link"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              padding: "20px 22px",
              background: "var(--color-surface)",
              borderRight: "1px solid var(--color-border)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <h2
                style={{
                  fontSize: "var(--size-16)",
                  fontWeight: 650,
                  letterSpacing: 0,
                  color: "var(--color-text)",
                }}
              >
                {group.label}
              </h2>
              <p
                style={{
                  fontSize: "var(--size-12)",
                  color: "var(--color-dim)",
                  lineHeight: 1.5,
                }}
              >
                {group.description}
              </p>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {group.links.map((link) => (
                <Link
                  key={link.slug}
                  href={`/p/${link.slug}`}
                  data-testid={`panel-link-${link.slug}`}
                  style={{
                    display: "block",
                    padding: "9px 10px",
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    background: "var(--color-surface-alt)",
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      color: "var(--color-text)",
                      fontSize: "var(--size-13)",
                      fontWeight: 600,
                    }}
                  >
                    {link.label}
                  </span>
                  <span
                    style={{
                      display: "block",
                      color: "var(--color-dim)",
                      fontSize: "var(--size-12)",
                      lineHeight: 1.45,
                      marginTop: 1,
                    }}
                  >
                    {link.description}
                  </span>
                </Link>
              ))}
            </div>
          </section>
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

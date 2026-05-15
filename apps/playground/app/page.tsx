import Link from "next/link";

const HOME_PANELS = [
  {
    slug: "generate",
    label: "Generate",
    description: "Create the key material and token used to authorize a paid request.",
  },
  {
    slug: "parse",
    label: "Parse",
    description: "Inspect incoming protocol material before deciding what to do next.",
  },
  {
    slug: "caveats",
    label: "Caveats",
    description: "Add caveats, create time limits, and check satisfiers.",
  },
  {
    slug: "validate",
    label: "Validate",
    description: "Verify signature, payment preimage, and caveats together.",
  },
  {
    slug: "demo",
    label: "Demo",
    description: "Try the paid flow against the playground demo surface.",
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
        {HOME_PANELS.map((panel) => (
          <Link
            key={panel.slug}
            href={`/p/${panel.slug}`}
            data-testid={`panel-link-${panel.slug}`}
            className="home-panel-link"
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
              {panel.label}
            </div>
            <div
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-dim)",
                lineHeight: 1.5,
              }}
            >
              {panel.description}
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

import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 880,
        margin: "0 auto",
        padding: "48px 24px",
      }}
    >
      <h1 style={{ marginBottom: 12 }}>playground</h1>
      <p
        style={{
          color: "var(--color-dim)",
          fontSize: "var(--size-15)",
          marginBottom: 24,
        }}
      >
        Local design preview. Open the design route to review every primitive
        in both themes.
      </p>
      <Link
        href="/design"
        style={{
          display: "inline-block",
          padding: "8px 14px",
          background: "var(--color-primary)",
          color: "var(--color-surface)",
          borderRadius: 4,
          fontSize: "var(--size-13)",
          fontWeight: 500,
        }}
      >
        Open /design
      </Link>
    </main>
  );
}

export default function HomePage() {
  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Boltwall Playground</p>
        <h1>Phase 0 scaffold is live.</h1>
        <p className="lede">
          This app shell will become the L402 inspection and paid-flow demo in a
          later phase. For now it only proves the Next.js, Tailwind, TypeScript,
          and workspace wiring.
        </p>
        <div className="status-grid">
          <article>
            <h2>Runtime</h2>
            <p>Next.js App Router on Bun workspaces.</p>
          </article>
          <article>
            <h2>Styling</h2>
            <p>Tailwind 4 is configured through PostCSS and global CSS.</p>
          </article>
          <article>
            <h2>Scope</h2>
            <p>UI content, shadcn, and paid flows land in later beads.</p>
          </article>
        </div>
      </section>
    </main>
  );
}

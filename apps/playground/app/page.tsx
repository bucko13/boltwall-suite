type Concept = {
  id: string;
  title: string;
  tagline: string;
  palette: "ledger" | "signal" | "market";
  density: string;
  posture: string;
};

const concepts: Concept[] = [
  {
    id: "A",
    title: "Ledger Desk",
    tagline: "A quiet analyst surface for inspecting credentials and payment state.",
    palette: "ledger",
    density: "Balanced panels",
    posture: "Best fit for docs-forward demos and careful debugging.",
  },
  {
    id: "B",
    title: "Signal Console",
    tagline: "A high-contrast operations console with fast payment-flow scanning.",
    palette: "signal",
    density: "Dense telemetry",
    posture: "Best fit for cypherpunk energy and live proxy monitoring.",
  },
  {
    id: "C",
    title: "Market Terminal",
    tagline: "A compact commercial tool for comparing prices, invoices, and access.",
    palette: "market",
    density: "Tabbed workbench",
    posture: "Best fit for repeated middleware and backend-adapter testing.",
  },
];

export default function HomePage() {
  return (
    <main className="concept-shell">
      <header className="review-header">
        <div>
          <p className="eyebrow">Boltwall Playground</p>
          <h1>Visual concept review</h1>
        </div>
        <div className="review-meta" aria-label="Design gate status">
          <span>bw-0dw.10</span>
          <span>Owner selection pending</span>
        </div>
      </header>

      <section className="concept-grid" aria-label="Playground visual concepts">
        {concepts.map((concept) => (
          <article className={`concept-card theme-${concept.palette}`} key={concept.id}>
            <div className="concept-copy">
              <span className="concept-id">Concept {concept.id}</span>
              <h2>{concept.title}</h2>
              <p>{concept.tagline}</p>
              <dl>
                <div>
                  <dt>Density</dt>
                  <dd>{concept.density}</dd>
                </div>
                <div>
                  <dt>Posture</dt>
                  <dd>{concept.posture}</dd>
                </div>
              </dl>
            </div>

            <div className="mockup-pair" aria-label={`${concept.title} light and dark previews`}>
              <PlaygroundMockup concept={concept} mode="light" />
              <PlaygroundMockup concept={concept} mode="dark" />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function PlaygroundMockup({
  concept,
  mode,
}: {
  concept: Concept;
  mode: "light" | "dark";
}) {
  return (
    <div className={`mockup ${mode}`} aria-label={`${concept.title} ${mode} mode`}>
      <div className="mockup-topbar">
        <span className="mark">BW</span>
        <nav aria-label="Preview navigation">
          <span>Inspect</span>
          <span>Pay</span>
          <span>Proxy</span>
        </nav>
        <span className="network">regtest</span>
      </div>

      <div className="mockup-body">
        <section className="hero-pane" aria-label="Credential overview preview">
          <div>
            <p>L402 challenge</p>
            <strong>401 payment required</strong>
          </div>
          <code>LSAT + L402 dual challenge</code>
        </section>

        <section className="data-pane" aria-label="Protocol fields preview">
          <div className="field-row">
            <span>macaroon</span>
            <b>AGIAJ...</b>
          </div>
          <div className="field-row">
            <span>invoice</span>
            <b>lnbc1500n...</b>
          </div>
          <div className="field-row">
            <span>preimage</span>
            <b>pending</b>
          </div>
        </section>

        <section className="paid-pane" aria-label="Paid demo preview">
          <div>
            <span className="price">1,500 msat</span>
            <strong>Pokedex endpoint</strong>
          </div>
          <button type="button">Settle invoice</button>
        </section>

        <aside className="mobile-preview" aria-label="Mobile preview">
          <span>Mobile</span>
          <div />
          <div />
          <button type="button">Pay</button>
        </aside>
      </div>
    </div>
  );
}

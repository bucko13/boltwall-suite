const longMacaroon =
  "AgEDbHRuYndhbGwCCmNoYWxsZW5nZQACIPQx7kZ80cv2A8x9uG0ew7Wb4uKQm7W6b4j7e51p9n7iAAITc2VydmljZXM9cG9rZWRleDowAAIVcG9rZWRleF9jYXBhYmlsaXRpZXM9cmVhZAAAG2V4cGlyZXNfYXQ9MjAyNi0wNS0xMFQyMTozMFoAAAVzaWc=";
const longInvoice =
  "lnbc1500n1pj9x8dapp5qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsp5w9j7k7l4m3n2p1q0r8s6t5u4v3w2x1y0z9a8b7c6d5e4f3g2h1qpp5z7s9q8r6t4y2u0i9o8p7a6s5d4f3g2h1j0k9l8m7n6b5v4c3x2sdqqcqzzsxqyz5vqsp5examplelonginvoicepayloadforreviewonly9qyyssq";
const preimage =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

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
          <span>Selected: Color Grid</span>
        </div>
      </header>

      <section className="concept-grid" aria-label="Selected playground visual concept">
        <article className="concept-card theme-colorgrid layout-colorgrid">
          <div className="concept-copy">
            <span className="concept-id">Selected concept</span>
            <h2>Color Grid</h2>
            <p>
              A bright, flat-grid interface with strong teal section color, coral accents,
              squared panels, and matching light and dark surfaces.
            </p>
            <dl>
              <div>
                <dt>Density</dt>
                <dd>Color-coded grid</dd>
              </div>
              <div>
                <dt>Posture</dt>
                <dd>Developer tool clarity with enough product energy to feel distinct.</dd>
              </div>
            </dl>
          </div>

          <div className="mockup-pair" aria-label="Color Grid light and dark previews">
            <PlaygroundMockup mode="light" />
            <PlaygroundMockup mode="dark" />
          </div>
        </article>
      </section>
    </main>
  );
}

function PlaygroundMockup({ mode }: { mode: "light" | "dark" }) {
  return (
    <div className={`mockup mockup-colorgrid ${mode}`} aria-label={`Color Grid ${mode} mode`}>
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
            <div className="field-row-head">
              <span>macaroon</span>
              <button type="button">Copy</button>
            </div>
            <code>{longMacaroon}</code>
          </div>
          <div className="field-row">
            <div className="field-row-head">
              <span>invoice</span>
              <button type="button">Copy</button>
            </div>
            <code>{longInvoice}</code>
          </div>
          <div className="field-row">
            <div className="field-row-head">
              <span>preimage</span>
              <button type="button">Copy</button>
            </div>
            <code>{preimage}</code>
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

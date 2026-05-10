"use client";

import { useMemo, useState } from "react";

type FlowStepId = "request" | "challenge" | "invoice" | "retry" | "success";

type FlowStep = {
  id: FlowStepId;
  label: string;
  status: string;
  method: string;
  detail: string;
};

const mockChallenge =
  'LSAT macaroon="AgEDbHRuYndhbGwCCmNoYWxsZW5nZQACIPQx7kZ80cv2A8x9uG0ew7Wb4uKQm7W6b4j7e51p9n7i", invoice="lnbc1500n1pj9x8dapp5qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"';
const mockCredential =
  "LSAT AgEDbHRuYndhbGwCCmNoYWxsZW5nZQACIPQx7kZ80cv2A8x9uG0ew7Wb4uKQm7W6b4j7e51p9n7i:000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const mockInvoice =
  "lnbc1500n1pj9x8dapp5qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsp5w9j7k7l4m3n2p1q0r8s6t5u4v3w2x1y0z9a8b7c6d5e4f3g2h1qpp5z7s9q8r6t4y2u0i9o8p7a6s5d4f3g2h1j0k9l8m7n6b5v4c3x2sdqqcqzzsxqyz5vqsp5examplelonginvoicepayloadforreviewonly9qyyssq";

const flowSteps: FlowStep[] = [
  {
    id: "request",
    label: "Protected request",
    status: "GET /api/pokedex/pikachu",
    method: "no credential",
    detail: "Client sends a normal request to a protected route.",
  },
  {
    id: "challenge",
    label: "402 challenge",
    status: "402 Payment Required",
    method: "WWW-Authenticate",
    detail: "Mock middleware returns dual LSAT/L402 challenge headers.",
  },
  {
    id: "invoice",
    label: "Invoice",
    status: "1,500 msat",
    method: "mock wallet",
    detail: "The demo records a local paid state; no Lightning payment is sent.",
  },
  {
    id: "retry",
    label: "Credential retry",
    status: "Authorization",
    method: "macaroon + preimage",
    detail: "Client retries with the locally generated demo credential.",
  },
  {
    id: "success",
    label: "Pokedex response",
    status: "200 OK",
    method: "fixture response",
    detail: "The route returns fixture data for design review.",
  },
];

const pokedexRows = [
  ["name", "pikachu"],
  ["type", "electric"],
  ["height", "0.4 m"],
  ["weight", "6.0 kg"],
];

const proxyRows = [
  ["origin", "https://api.example.test"],
  ["protected path", "/pokedex/:name"],
  ["price", "1,500 msat"],
  ["backend", "unconfigured"],
];

const firstFlowStep = flowSteps[0] as FlowStep;

export default function HomePage() {
  const [activeStep, setActiveStep] = useState<FlowStepId>("request");
  const activeIndex = flowSteps.findIndex((step) => step.id === activeStep);
  const active = flowSteps[activeIndex] ?? firstFlowStep;

  const nextStep = useMemo(() => {
    const nextIndex = Math.min(activeIndex + 1, flowSteps.length - 1);
    return flowSteps[nextIndex] ?? firstFlowStep;
  }, [activeIndex]);

  const previousStep = flowSteps[Math.max(activeIndex - 1, 0)] ?? firstFlowStep;

  return (
    <main className="playground-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Boltwall Playground</p>
          <h1>L402 payment flow</h1>
        </div>
        <div className="demo-badge" aria-label="Demo environment status">
          <span>Mocked demo</span>
          <strong>No wallet, proxy, or secrets connected</strong>
        </div>
      </header>

      <section className="workbench" aria-label="Mocked L402 paid-flow demo">
        <nav className="flow-rail" aria-label="Demo flow steps">
          {flowSteps.map((step, index) => (
            <button
              aria-current={step.id === active.id ? "step" : undefined}
              className="flow-step"
              key={step.id}
              onClick={() => setActiveStep(step.id)}
              type="button"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step.label}</strong>
              <em>{step.status}</em>
            </button>
          ))}
        </nav>

        <section className="flow-panel" aria-live="polite">
          <div className="panel-header">
            <div>
              <p>{active.method}</p>
              <h2>{active.label}</h2>
            </div>
            <span>{active.status}</span>
          </div>

          <div className="mock-warning">
            <strong>Mocked/demo-only</strong>
            <span>{active.detail}</span>
          </div>

          <ProtocolRows activeStep={active.id} />

          <div className="panel-actions">
            <button
              disabled={active.id === "request"}
              onClick={() => setActiveStep(previousStep.id)}
              type="button"
            >
              Previous
            </button>
            <button
              disabled={active.id === "success"}
              onClick={() => setActiveStep(nextStep.id)}
              type="button"
            >
              Advance
            </button>
          </div>
        </section>

        <aside className="result-panel" aria-label="Mocked Pokedex and proxy state">
          <section>
            <div className="section-head">
              <p>fixture response</p>
              <h2>Pokedex</h2>
            </div>
            <DataGrid rows={pokedexRows} />
          </section>

          <section>
            <div className="section-head">
              <p>deployment preview</p>
              <h2>Proxy config</h2>
            </div>
            <DataGrid rows={proxyRows} />
            <div className="secret-state">
              <strong>Disabled</strong>
              <span>Backend credentials and macaroon root keys are not configured.</span>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function ProtocolRows({ activeStep }: { activeStep: FlowStepId }) {
  const rows = [
    ["WWW-Authenticate", activeStep === "request" ? "pending" : mockChallenge],
    [
      "bolt11",
      activeStep === "invoice" || activeStep === "retry" || activeStep === "success"
        ? mockInvoice
        : "pending",
    ],
    [
      "Authorization",
      activeStep === "retry" || activeStep === "success" ? mockCredential : "pending",
    ],
  ];

  return (
    <div className="protocol-table" aria-label="Mock protocol values">
      {rows.map(([label, value]) => (
        <div className="protocol-row" key={label}>
          <div>
            <span>{label}</span>
            <button type="button" aria-label={`Copy ${label}`}>
              Copy
            </button>
          </div>
          <code>{value}</code>
        </div>
      ))}
    </div>
  );
}

function DataGrid({ rows }: { rows: string[][] }) {
  return (
    <dl className="data-grid">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

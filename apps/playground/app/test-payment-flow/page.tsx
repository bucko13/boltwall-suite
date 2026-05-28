// Test-only page that hosts the PaymentFlow component against the paid
// Pokedex endpoint. Not linked from the nav; exists so Playwright can drive
// the WebLN + paste-preimage paths without modifying a user-facing panel.
// Mirrors the `app/test-l402/page.tsx` precedent.

import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default process.env.NODE_ENV === "production"
  ? function TestPaymentFlowPage() {
      notFound();
    }
  : async function TestPaymentFlowPage() {
      const { PaymentFlow } = await import("../../components/PaymentFlow");

      return (
        <main
          className="panel-main"
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "32px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <h1 style={{ margin: 0, fontSize: "var(--size-20)" }}>Payment flow test harness</h1>
          <p style={{ margin: 0, color: "var(--color-dim)", fontSize: "var(--size-13)" }}>
            Drives the L402 challenge → pay → retry flow against <code>/api/pokemon/1</code>.
            Test-only — not linked from the nav.
          </p>
          <PaymentFlow endpoint="/api/pokemon/1" label="Get Pokemon #1" />
        </main>
      );
    };

"use client";

import * as l402 from "@boltwall/l402";
import { useEffect } from "react";

// Exposes the @boltwall/l402 module on window.__l402 so Playwright's
// page.evaluate() can call it with fixture data without needing a global bundle.
// This page is test-only; it is not linked from the nav.
declare global {
  interface Window {
    __l402?: typeof l402;
  }
}

export default function TestL402Page() {
  useEffect(() => {
    window.__l402 = l402;
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <div data-testid="l402-test-ready">l402 browser test harness</div>
    </main>
  );
}

"use client";

import * as l402 from "@boltwall/l402";
import { useEffect } from "react";

// Dev-only Playwright bridge. The route parent dynamically imports this only
// after the production-build gate has passed.
declare global {
  interface Window {
    __l402?: typeof l402;
  }
}

export function TestL402Harness() {
  useEffect(() => {
    window.__l402 = l402;
  }, []);

  return <div data-testid="l402-test-ready">l402 browser test harness</div>;
}

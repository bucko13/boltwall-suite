/**
 * Placeholder runtime handle for the Phase 0 proxy scaffold.
 */
export interface ProxyRuntimeStub {
  readonly mode: "stub";
}

/**
 * Create the minimal runtime placeholder exported by the initial proxy shell.
 */
export function createProxyRuntimeStub(): ProxyRuntimeStub {
  return { mode: "stub" };
}

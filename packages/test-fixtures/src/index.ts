/**
 * Minimal typed export so the Phase 0 package shell builds cleanly before the
 * first real fixture modules land.
 */
export interface FixtureCatalogStub {
  readonly status: "stub";
}

/**
 * Placeholder value for the initial package scaffold. Real fixture exports land
 * in follow-up beads.
 */
export const fixtureCatalogStub: FixtureCatalogStub = {
  status: "stub",
};

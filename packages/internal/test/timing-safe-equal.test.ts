import { describe, expect, test } from "bun:test";

import { timingSafeEqual } from "../src/timing-safe-equal";

function bytes(values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function perCallMs(target: Uint8Array, candidate: Uint8Array, rounds: number): number {
  let matches = 0;
  const started = performance.now();
  for (let i = 0; i < rounds; i++) {
    if (timingSafeEqual(target, candidate)) {
      matches++;
    }
  }
  expect(matches).toBe(0);
  return (performance.now() - started) / rounds;
}

describe("timingSafeEqual", () => {
  test("returns true for equal byte arrays", () => {
    expect(timingSafeEqual(bytes([0, 1, 2]), bytes([0, 1, 2]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array(), new Uint8Array())).toBe(true);
  });

  test("returns false for mismatches at any byte position", () => {
    expect(timingSafeEqual(bytes([9, 1, 2]), bytes([0, 1, 2]))).toBe(false);
    expect(timingSafeEqual(bytes([0, 9, 2]), bytes([0, 1, 2]))).toBe(false);
    expect(timingSafeEqual(bytes([0, 1, 9]), bytes([0, 1, 2]))).toBe(false);
  });

  test("returns false for different lengths", () => {
    expect(timingSafeEqual(bytes([0, 1]), bytes([0, 1, 2]))).toBe(false);
  });

  test("handles 32-byte sha256-sized arrays", () => {
    const a = new Uint8Array(32);
    const b = new Uint8Array(32);
    a[31] = 255;
    b[31] = 255;

    expect(timingSafeEqual(a, b)).toBe(true);

    b[0] = 1;
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  test("does not show first-difference timing correlation in a smoke check", () => {
    const target = new Uint8Array(1_024);
    const firstByteDiffers = new Uint8Array(1_024);
    const lastByteDiffers = new Uint8Array(1_024);
    firstByteDiffers[0] = 1;
    lastByteDiffers[1_023] = 1;

    const rounds = 20_000;
    perCallMs(target, firstByteDiffers, 1_000);
    perCallMs(target, lastByteDiffers, 1_000);

    const early = perCallMs(target, firstByteDiffers, rounds);
    const late = perCallMs(target, lastByteDiffers, rounds);
    const slower = Math.max(early, late);
    const faster = Math.max(Math.min(early, late), Number.EPSILON);

    expect(slower / faster).toBeLessThan(8);
  });
});

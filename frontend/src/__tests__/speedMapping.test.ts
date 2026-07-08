import { describe, it, expect } from "vitest";
import { speedToPlaybackRate, playbackRateToSpeed } from "../services/speedMapping";

describe("speedToPlaybackRate (default baseline = 8 km/h)", () => {
  it("returns 0.25 at 0 km/h", () => {
    expect(speedToPlaybackRate(0, 8)).toBeCloseTo(0.25, 3);
  });

  it("returns 1.00 at baseline (8 km/h)", () => {
    expect(speedToPlaybackRate(8, 8)).toBeCloseTo(1.0, 3);
  });

  it("returns ~0.625 at 4 km/h (half baseline)", () => {
    expect(speedToPlaybackRate(4, 8)).toBeCloseTo(0.625, 1);
  });

  it("returns 4.00 at 4× baseline (32 km/h)", () => {
    expect(speedToPlaybackRate(32, 8)).toBeCloseTo(4.0, 3);
  });

  it("clamps above 4× baseline to 4.0x", () => {
    expect(speedToPlaybackRate(60, 8)).toBeCloseTo(4.0, 3);
  });

  it("works with custom baseline of 15 km/h", () => {
    expect(speedToPlaybackRate(15, 15)).toBeCloseTo(1.0, 3);
    expect(speedToPlaybackRate(60, 15)).toBeCloseTo(4.0, 3);
  });
});

describe("playbackRateToSpeed", () => {
  it("returns 0 at min rate", () => {
    expect(playbackRateToSpeed(0.25, 8)).toBeCloseTo(0, 0);
  });

  it("returns 8 km/h at 1.00x", () => {
    expect(playbackRateToSpeed(1.0, 8)).toBeCloseTo(8, 0);
  });

  it("returns 32 km/h at 4.00x", () => {
    expect(playbackRateToSpeed(4.0, 8)).toBeCloseTo(32, 0);
  });
});

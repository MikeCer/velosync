const MIN_PLAYBACK = 0.25;
const MAX_PLAYBACK = 4.0;

const DEFAULT_BASELINE_KMH = 8; // 8 km/h = 1.00x video speed

export function getBaselineSpeed(): number {
  const stored = localStorage.getItem("speedBaselineKmh");
  if (stored) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 60) return parsed;
  }
  return DEFAULT_BASELINE_KMH;
}

export function setBaselineSpeed(kmh: number): void {
  localStorage.setItem("speedBaselineKmh", String(kmh));
}

/**
 * Map bicycle speed to video playback rate.
 * At baseline speed (default 8 km/h) → 1.00x.
 * At 0 km/h → 0.25x, proportional in between.
 * Max rate clamped to 4.0x.
 */
export function speedToPlaybackRate(speedKmh: number, baselineKmh?: number): number {
  const baseline = baselineKmh ?? getBaselineSpeed();
  const clamped = Math.max(0, Math.min(speedKmh, baseline * 4));
  // speed at baseline = rate 1.0; speed = 0 → min rate; speed = baseline*4 → max rate
  if (clamped <= baseline) {
    const t = clamped / baseline;
    return MIN_PLAYBACK + t * (1.0 - MIN_PLAYBACK);
  } else {
    const t = (clamped - baseline) / (baseline * 3);
    return 1.0 + t * (MAX_PLAYBACK - 1.0);
  }
}

export function playbackRateToSpeed(rate: number, baselineKmh?: number): number {
  const baseline = baselineKmh ?? getBaselineSpeed();
  const clamped = Math.max(MIN_PLAYBACK, Math.min(rate, MAX_PLAYBACK));
  if (clamped <= 1.0) {
    const t = (clamped - MIN_PLAYBACK) / (1.0 - MIN_PLAYBACK);
    return t * baseline;
  } else {
    const t = (clamped - 1.0) / (MAX_PLAYBACK - 1.0);
    return baseline + t * (baseline * 3);
  }
}

import { useEffect, useMemo, useState } from "react";
import { velosyncWsConnector } from "../services/velosyncWs";
import type { VeloSyncHardwareConfig } from "../types";

interface Props {
  currentDistanceM: number;
  magnetsPerRev: number;
  onSaved: (config: VeloSyncHardwareConfig) => void;
}

interface SpeedSample {
  speedKmh: number;
  timestampMs: number;
}

type Phase = "idle" | "measuring" | "review" | "done";

const SAMPLE_WINDOW_MS = 3000;
const MIN_SAMPLE_DURATION_MS = 2500;
const MIN_SAMPLE_COUNT = 15;
const MAX_SPEED_VARIATION = 0.08;

export default function VeloSyncCalibrationWizard({
  currentDistanceM,
  magnetsPerRev,
  onSaved,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [samples, setSamples] = useState<SpeedSample[]>([]);
  const [bikeSpeed, setBikeSpeed] = useState("");
  const [measuredSpeed, setMeasuredSpeed] = useState(0);
  const [calculatedDistance, setCalculatedDistance] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (phase !== "measuring") return;

    return velosyncWsConnector.subscribeSpeed((speedKmh) => {
      const now = Date.now();
      setSamples((current) => [
        ...current.filter((sample) => sample.timestampMs >= now - SAMPLE_WINDOW_MS),
        { speedKmh, timestampMs: now },
      ]);
    });
  }, [phase]);

  const measurement = useMemo(() => {
    const movingSamples = samples.filter((sample) => sample.speedKmh >= 1);
    if (movingSamples.length === 0) {
      return { average: 0, variation: Infinity, durationMs: 0, ready: false };
    }

    const speeds = movingSamples.map((sample) => sample.speedKmh);
    const average = speeds.reduce((total, speed) => total + speed, 0) / speeds.length;
    const durationMs =
      movingSamples[movingSamples.length - 1].timestampMs - movingSamples[0].timestampMs;
    const variation = (Math.max(...speeds) - Math.min(...speeds)) / average;
    return {
      average,
      variation,
      durationMs,
      ready:
        movingSamples.length >= MIN_SAMPLE_COUNT &&
        durationMs >= MIN_SAMPLE_DURATION_MS &&
        variation <= MAX_SPEED_VARIATION,
    };
  }, [samples]);

  const parsedBikeSpeed = Number(bikeSpeed);
  const bikeSpeedValid = Number.isFinite(parsedBikeSpeed) && parsedBikeSpeed > 0;

  const begin = () => {
    setSamples([]);
    setBikeSpeed("");
    setError("");
    setPhase("measuring");
  };

  const calculate = () => {
    if (!measurement.ready || !bikeSpeedValid) return;

    const nextDistance =
      Math.round((currentDistanceM * parsedBikeSpeed / measurement.average) * 1000) / 1000;
    if (nextDistance < 0.1 || nextDistance > 10) {
      setError(
        `Calculated distance ${nextDistance.toFixed(3)} m is outside the supported 0.1–10.0 m range.`
      );
      return;
    }

    setMeasuredSpeed(measurement.average);
    setCalculatedDistance(nextDistance);
    setError("");
    setPhase("review");
  };

  const save = async () => {
    if (!Number.isInteger(magnetsPerRev) || magnetsPerRev < 1 || magnetsPerRev > 16) {
      setError("The device magnet count is invalid. Save a valid value before calibrating.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const saved = await velosyncWsConnector.updateConfig({
        wheelCircumferenceM: calculatedDistance,
        magnetsPerRev,
      });
      onSaved(saved);
      setPhase("done");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save calibration to the device."
      );
    } finally {
      setSaving(false);
    }
  };

  const buttonStyle = {
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  } as const;

  if (phase === "idle") {
    return (
      <button onClick={begin} style={{ ...buttonStyle, marginTop: 10 }}>
        Start calibration wizard
      </button>
    );
  }

  if (phase === "done") {
    return (
      <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "var(--success-bg)", color: "var(--success)", fontSize: 12 }}>
        Calibration saved to the device: {calculatedDistance.toFixed(3)} m per sensor revolution.
        <button onClick={() => setPhase("idle")} style={{ ...buttonStyle, marginLeft: 8 }}>Done</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 8, border: "1px solid var(--border-secondary)", background: "var(--bg-input)" }}>
      {phase === "measuring" ? (
        <>
          <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>1. Pedal at a steady speed</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)" }}>
            Hold the speed until the reading is stable, then enter the speed shown on the bike display.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1, padding: 8, borderRadius: 6, background: "var(--bg-secondary)" }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)" }}>VeloSync average</div>
              <div style={{ fontSize: 18, color: "var(--text-primary)", fontWeight: 700 }}>
                {measurement.average.toFixed(1)} km/h
              </div>
              <div style={{ fontSize: 10, color: measurement.ready ? "var(--success)" : "var(--text-muted)" }}>
                {measurement.ready
                  ? "Stable"
                  : measurement.average > 0
                    ? `Stabilizing (${Math.round(measurement.variation * 100)}% variation)`
                    : "Waiting for movement"}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 10, color: "var(--text-dim)" }}>Bike display (km/h)</label>
              <input
                type="number"
                value={bikeSpeed}
                onChange={(event) => setBikeSpeed(event.target.value)}
                min={1}
                max={100}
                step={0.1}
                style={{ boxSizing: "border-box", width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border-input)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: 14 }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={calculate}
              disabled={!measurement.ready || !bikeSpeedValid}
              style={{ ...buttonStyle, opacity: measurement.ready && bikeSpeedValid ? 1 : 0.5, cursor: measurement.ready && bikeSpeedValid ? "pointer" : "not-allowed" }}
            >
              Calculate calibration
            </button>
            <button onClick={() => setPhase("idle")} style={{ ...buttonStyle, background: "transparent", border: "1px solid var(--border-input)", color: "var(--text-muted)" }}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>2. Review calibration</div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Current distance: <strong>{currentDistanceM.toFixed(3)} m</strong><br />
            VeloSync average: <strong>{measuredSpeed.toFixed(1)} km/h</strong><br />
            Bike display: <strong>{parsedBikeSpeed.toFixed(1)} km/h</strong><br />
            New distance: <strong style={{ color: "var(--accent-light)" }}>{calculatedDistance.toFixed(3)} m</strong>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-dim)" }}>
            {currentDistanceM.toFixed(3)} × {parsedBikeSpeed.toFixed(1)} ÷ {measuredSpeed.toFixed(1)} = {calculatedDistance.toFixed(3)} m
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={save} disabled={saving} style={{ ...buttonStyle, cursor: saving ? "wait" : "pointer" }}>
              {saving ? "Saving…" : "Save to device"}
            </button>
            <button onClick={begin} disabled={saving} style={{ ...buttonStyle, background: "transparent", border: "1px solid var(--border-input)", color: "var(--text-muted)" }}>
              Measure again
            </button>
          </div>
        </>
      )}
      {error && <div style={{ marginTop: 8, color: "var(--danger)", fontSize: 11 }}>{error}</div>}
    </div>
  );
}

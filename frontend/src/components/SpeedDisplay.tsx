import { useAppState } from "../context/AppContext";

export default function SpeedDisplay() {
  const { playbackRate, effectiveSpeed } = useAppState();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
      {/* Speed gauge */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{
          fontSize: 48, fontWeight: 800, lineHeight: 1,
          background: "var(--accent-gradient)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          fontVariantNumeric: "tabular-nums",
        }}>
          {effectiveSpeed.toFixed(1)}
        </span>
        <span style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 500 }}>km/h</span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 40, background: "var(--glass-border)", alignSelf: "center" }} />

      {/* Playback rate badge */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 16px", borderRadius: "var(--radius-lg)",
        background: "var(--accent-bg)",
        border: "1px solid rgba(99, 102, 241, 0.2)",
      }}>
        <span style={{
          fontSize: 24, fontWeight: 700,
          color: "var(--accent-light)",
          fontVariantNumeric: "tabular-nums",
        }}>
          {playbackRate.toFixed(2)}×
        </span>
        <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>
          video speed
        </span>
      </div>
    </div>
  );
}

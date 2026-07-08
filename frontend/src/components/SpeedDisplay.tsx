import { useAppState } from "../context/AppContext";
const C = { accent: "var(--accent)", warning: "var(--warning)", textMuted: "var(--text-muted)", divider: "var(--border-secondary)" };

export default function SpeedDisplay() {
  const { playbackRate, effectiveSpeed } = useAppState();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span style={{ fontSize: 36, fontWeight: 700, color: C.accent, lineHeight: 1 }}>{effectiveSpeed.toFixed(1)}</span><span style={{ fontSize: 15, color: C.textMuted }}>km/h</span></div>
      <div style={{ width: 1, height: 28, background: C.divider }} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span style={{ fontSize: 24, fontWeight: 700, color: C.warning, lineHeight: 1 }}>{playbackRate.toFixed(2)}×</span><span style={{ fontSize: 14, color: C.textMuted }}>video speed</span></div>
    </div>
  );
}

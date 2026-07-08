import { useAppState } from "../context/AppContext";
const C = { accent: "var(--accent)", textMuted: "var(--text-muted)", textDim: "var(--text-dim)", border: "var(--border-secondary)" };

export default function SpeedSlider() {
  const { manualSpeedKmh, setManualSpeedKmh, useBleSpeed } = useAppState();
  return (
    <div style={{ marginBottom: 16, opacity: useBleSpeed ? 0.4 : 1, transition: "opacity 0.2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 13, color: C.textMuted }}>Manual speed</span><span style={{ fontSize: 13, color: C.textMuted }}>{useBleSpeed ? "BLE active" : `${manualSpeedKmh.toFixed(0)} km/h`}</span></div>
      <input type="range" min={0} max={60} step={1} value={manualSpeedKmh} onChange={(e) => setManualSpeedKmh(Number(e.target.value))} disabled={useBleSpeed} style={{ width: "100%", height: 8, borderRadius: 4, accentColor: "#4f46e5", cursor: useBleSpeed ? "not-allowed" : "pointer" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textDim }}><span>0</span><span>30</span><span>60 km/h</span></div>
    </div>
  );
}

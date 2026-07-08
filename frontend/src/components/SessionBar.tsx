import { useAppState } from "../context/AppContext";
const C = { textMuted: "var(--text-muted)", textDim: "var(--text-dim)", bg: "var(--bg-secondary)", border: "var(--border-primary)" };

function formatTime(seconds: number): string { const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = Math.floor(seconds % 60); if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; return `${m}:${String(s).padStart(2, "0")}`; }

export default function SessionBar() {
  const { isPlaying, sessionElapsed, totalDistance } = useAppState();
  const avgSpeed = sessionElapsed > 0 ? (totalDistance / (sessionElapsed / 3600)) : 0;
  return (
    <div style={{ display: "flex", gap: 16, padding: "10px 16px", borderRadius: 10, background: C.bg, fontSize: 14, color: C.textMuted, marginBottom: 16, justifyContent: "space-around" }}>
      <div><span style={{ color: C.textDim, marginRight: 4 }}>⏱</span>{formatTime(sessionElapsed)}</div>
      <div><span style={{ color: C.textDim, marginRight: 4 }}>📏</span>{totalDistance.toFixed(2)} km</div>
      <div><span style={{ color: C.textDim, marginRight: 4 }}>⚡</span>{avgSpeed.toFixed(1)} km/h avg</div>
    </div>
  );
}

import { useAppState } from "../context/AppContext";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SessionBar() {
  const { isPlaying, sessionElapsed, totalDistance } = useAppState();
  const avgSpeed = sessionElapsed > 0 ? (totalDistance / (sessionElapsed / 3600)) : 0;

  const stats = [
    { icon: "⏱", label: "Time", value: formatTime(sessionElapsed), color: "#818cf8" },
    { icon: "📏", label: "Distance", value: `${totalDistance.toFixed(2)} km`, color: "#34d399" },
    { icon: "⚡", label: "Avg Speed", value: `${avgSpeed.toFixed(1)} km/h`, color: "#fbbf24" },
  ];

  return (
    <div style={{
      display: "flex", gap: 8,
      padding: "4px",
      borderRadius: "var(--radius-lg)",
      background: "var(--bg-input)",
      border: "1px solid var(--glass-border)",
    }}>
      {stats.map((stat) => (
        <div key={stat.label} style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          padding: "10px 8px", borderRadius: "var(--radius-md)",
          background: "rgba(255,255,255,0.03)",
          gap: 4,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {stat.icon} {stat.label}
          </span>
          <span style={{
            fontSize: 16, fontWeight: 700, color: stat.color,
            fontVariantNumeric: "tabular-nums",
          }}>
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}

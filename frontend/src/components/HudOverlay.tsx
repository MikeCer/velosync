import { useAppState } from "../context/AppContext";

type HudCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const CORNER_STYLES: Record<HudCorner, React.CSSProperties> = {
  "top-left":    { top: 16, left: 16 },
  "top-right":   { top: 16, right: 16 },
  "bottom-left": { bottom: 64, left: 16 },
  "bottom-right":{ bottom: 64, right: 16 },
};

interface HudOverlayProps {
  visible: boolean;
}

export default function HudOverlay({ visible }: HudOverlayProps) {
  const { effectiveSpeed, playbackRate, heartRate, totalDistance, sessionElapsed, hrmConnected } = useAppState();

  if (!visible) return null;

  const corner: HudCorner = (localStorage.getItem("hudCorner") as HudCorner) || "top-right";
  const pos = CORNER_STYLES[corner];

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const rows: { label: string; value: string; color: string }[] = [
    { label: "SPEED", value: `${effectiveSpeed.toFixed(1)} km/h`, color: "#4ade80" },
    ...(hrmConnected
      ? [{ label: "HR", value: `${heartRate ?? "--"} BPM`, color: "#f87171" }]
      : []),
    { label: "DIST", value: `${totalDistance.toFixed(2)} km`, color: "#60a5fa" },
    { label: "TIME", value: formatTime(sessionElapsed), color: "#c084fc" },
    { label: "RATE", value: `${playbackRate.toFixed(2)}×`, color: "#fbbf24" },
  ];

  return (
    <div style={{
      position: "absolute",
      ...pos,
      padding: "12px 16px",
      borderRadius: 14,
      background: "rgba(0,0,0,0.65)",
      backdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,0.10)",
      pointerEvents: "none",
      zIndex: 10,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {rows.map((row) => (
        <div key={row.label} style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em", minWidth: 38 }}>
            {row.label}
          </span>
          <span style={{
            fontSize: 18, fontWeight: 700, color: row.color,
            fontVariantNumeric: "tabular-nums", lineHeight: 1.3,
          }}>
            {row.label === "HR" ? `❤️ ${row.value}` : row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
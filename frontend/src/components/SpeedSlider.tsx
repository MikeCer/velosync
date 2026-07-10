import { useAppState } from "../context/AppContext";

export default function SpeedSlider() {
  const { manualSpeedKmh, setManualSpeedKmh, speedSource } = useAppState();
  const isDisabled = speedSource !== "manual";

  return (
    <div style={{
      opacity: isDisabled ? 0.5 : 1,
      transition: "opacity var(--transition-base)",
      pointerEvents: isDisabled ? "none" : "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
          Manual speed
        </span>
        <span style={{
          fontSize: 13, fontWeight: 700,
          color: isDisabled ? "var(--text-dim)" : "var(--accent-light)",
        }}>
          {isDisabled ? "Hardware active" : `${manualSpeedKmh.toFixed(0)} km/h`}
        </span>
      </div>
      <div style={{ position: "relative", height: 40, display: "flex", alignItems: "center" }}>
        <input
          type="range"
          min={0} max={60} step={1}
          value={manualSpeedKmh}
          onChange={(e) => setManualSpeedKmh(Number(e.target.value))}
          disabled={isDisabled}
          style={{
            width: "100%", height: 6,
            borderRadius: "var(--radius-full)",
            background: isDisabled
              ? "var(--border-secondary)"
              : `linear-gradient(to right, var(--accent) 0%, var(--accent) ${(manualSpeedKmh / 60) * 100}%, var(--border-secondary) ${(manualSpeedKmh / 60) * 100}%, var(--border-secondary) 100%)`,
            appearance: "none",
            WebkitAppearance: "none",
            cursor: isDisabled ? "not-allowed" : "pointer",
            outline: "none",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
        <span>0</span><span>15</span><span>30</span><span>45</span><span>60 km/h</span>
      </div>
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px; height: 20px;
          border-radius: 50%;
          background: var(--accent-gradient);
          border: 3px solid var(--bg-primary);
          box-shadow: 0 0 12px var(--accent-glow);
          cursor: pointer;
          transition: transform var(--transition-fast);
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        input[type="range"]:disabled::-webkit-slider-thumb {
          background: var(--text-dim);
          box-shadow: none;
          cursor: not-allowed;
          transform: none;
        }
        input[type="range"]::-moz-range-thumb {
          width: 20px; height: 20px;
          border-radius: 50%;
          background: var(--accent-gradient);
          border: 3px solid var(--bg-primary);
          box-shadow: 0 0 12px var(--accent-glow);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

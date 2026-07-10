import { useState, useEffect } from "react";

export interface AudioState {
  muted: boolean;
  volume: number;
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  compact?: boolean;
}

export default function AudioControl({ videoRef, compact = false }: Props) {
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setMuted(video.muted);
    setVolume(video.volume);
  }, [videoRef]);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    video.muted = v === 0;
    setVolume(v);
    setMuted(video.muted);
  };

  const icon = muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊";

  const sliderStyle: React.CSSProperties = {
    width: compact ? 60 : 80,
    height: 4,
    borderRadius: "var(--radius-full)",
    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${volume * 100}%, var(--border-secondary) ${volume * 100}%, var(--border-secondary) 100%)`,
    appearance: "none",
    WebkitAppearance: "none",
    cursor: "pointer",
    outline: "none",
  };

  if (compact) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          onClick={toggleMute}
          style={{
            width: 32, height: 32, borderRadius: "var(--radius-sm)",
            border: "none", background: "rgba(255,255,255,0.1)",
            color: "#fff", fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          title={muted ? "Unmute" : "Mute"}
        >
          {icon}
        </button>
        <input
          type="range" min={0} max={1} step={0.05}
          value={volume} onChange={handleVolumeChange}
          style={sliderStyle}
          title={`Volume: ${Math.round(volume * 100)}%`}
        />
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 14px", borderRadius: "var(--radius-lg)",
      background: "var(--bg-input)",
      border: "1px solid var(--glass-border)",
    }}>
      <button
        onClick={toggleMute}
        style={{
          width: 32, height: 32, borderRadius: "var(--radius-sm)",
          border: "none", background: "transparent",
          color: "var(--text-primary)", fontSize: 18, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all var(--transition-fast)",
        }}
        title={muted ? "Unmute" : "Mute"}
      >
        {icon}
      </button>
      <input
        type="range" min={0} max={1} step={0.05}
        value={volume} onChange={handleVolumeChange}
        style={sliderStyle}
        title={`Volume: ${Math.round(volume * 100)}%`}
      />
    </div>
  );
}

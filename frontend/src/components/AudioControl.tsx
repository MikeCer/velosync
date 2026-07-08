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

  // Sync from video element
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

  if (compact) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          onClick={toggleMute}
          style={{ padding: "4px 6px", borderRadius: 4, border: "none", background: "transparent", color: "#fff", fontSize: 16, cursor: "pointer", lineHeight: 1 }}
          title={muted ? "Unmute" : "Mute"}
        >
          {icon}
        </button>
        <input
          type="range"
          min={0} max={1} step={0.05}
          value={volume}
          onChange={handleVolumeChange}
          style={{ width: 60, accentColor: "#4f46e5" }}
          title={`Volume: ${Math.round(volume * 100)}%`}
        />
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 10px", borderRadius: 8,
      background: "rgba(255,255,255,0.08)",
    }}>
      <button
        onClick={toggleMute}
        style={{ padding: "2px 4px", borderRadius: 4, border: "none", background: "transparent", color: "#fff", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
        title={muted ? "Unmute" : "Mute"}
      >
        {icon}
      </button>
      <input
        type="range"
        min={0} max={1} step={0.05}
        value={volume}
        onChange={handleVolumeChange}
        style={{ width: 80, accentColor: "#4f46e5" }}
        title={`Volume: ${Math.round(volume * 100)}%`}
      />
    </div>
  );
}

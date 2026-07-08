import { useState } from "react";
import { useAppState } from "../context/AppContext";
import { fetchVideoInfo } from "../services/api";

export default function VideoInput() {
  const {
    youtubeUrl,
    setYoutubeUrl,
    setVideoMeta,
    isPlaying,
  } = useAppState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLoad = async () => {
    if (!youtubeUrl.trim()) return;
    setError("");
    setLoading(true);
    try {
      const meta = await fetchVideoInfo(youtubeUrl.trim());
      setVideoMeta(meta);
    } catch (e: any) {
      setError(e.message || "Failed to load video");
      setVideoMeta(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLoad()}
          placeholder="Paste YouTube URL…"
          disabled={isPlaying || loading}
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: 10,
            border: "2px solid #444",
            background: "#1e1e1e",
            color: "#eee",
            fontSize: 16,
          }}
        />
        <button
          onClick={handleLoad}
          disabled={!youtubeUrl.trim() || isPlaying || loading}
          style={{
            padding: "12px 24px",
            borderRadius: 10,
            border: "none",
            background: "#4f46e5",
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            cursor: youtubeUrl.trim() && !isPlaying && !loading ? "pointer" : "not-allowed",
            opacity: youtubeUrl.trim() && !isPlaying && !loading ? 1 : 0.5,
          }}
        >
          {loading ? "Loading…" : "Load"}
        </button>
      </div>
      {error && (
        <div style={{ color: "#f87171", marginTop: 8, fontSize: 14 }}>{error}</div>
      )}
    </div>
  );
}

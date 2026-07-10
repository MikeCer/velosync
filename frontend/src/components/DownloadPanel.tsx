import { useState, useEffect } from "react";
import { startDownload, subscribeDownloadProgress } from "../services/api";
import type { DownloadState } from "../services/api";

const QUALITIES = ["2160p", "1440p", "1080p", "720p", "480p", "360p"];

export default function DownloadPanel({ onDownloadComplete }: { onDownloadComplete: () => void }) {
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState("1080p");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloads, setDownloads] = useState<DownloadState>({});

  useEffect(() => {
    const close = subscribeDownloadProgress((s) => setDownloads(s));
    return close;
  }, []);

  const handleDownload = async () => {
    if (!url.trim()) return;
    setError("");
    setLoading(true);
    try {
      await startDownload(url.trim(), quality);
      setUrl("");
      onDownloadComplete();
    } catch (e: any) {
      setError(e.message || "Download failed");
    } finally {
      setLoading(false);
    }
  };

  const allVisible = Object.entries(downloads)
    .filter(([, d]) => d.percent < 100 || d.status === "completed" || d.status === "failed")
    .reduce((acc, [id, d]) => {
      if (!acc.find(([i]) => i === id)) acc.push([id, d]);
      return acc;
    }, [] as [string, any][]);

  return (
    <div className="glass-card" style={{ padding: "20px" }}>
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px 0" }}>
          ⬇ Download Video
        </h3>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Paste a YouTube URL to download
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleDownload()}
          placeholder="Paste YouTube URL…"
          disabled={loading}
          style={{
            flex: "1 1 200px",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-input)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
            fontSize: 14,
            outline: "none",
            transition: "border-color var(--transition-fast)",
          }}
        />
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          style={{
            padding: "10px 8px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-input)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
            fontSize: 14, cursor: "pointer",
            outline: "none",
          }}
        >
          {QUALITIES.map((q) => (
            <option key={q} value={q}>{q}</option>
          ))}
        </select>
        <button
          onClick={handleDownload}
          disabled={!url.trim() || loading}
          className="btn-gradient"
          style={{
            padding: "10px 24px", fontSize: 14,
          }}
        >
          {loading ? "…" : "Download"}
        </button>
      </div>

      {error && (
        <div style={{
          color: "var(--danger)", fontSize: 13,
          marginBottom: 12, padding: "8px 12px",
          borderRadius: "var(--radius-md)",
          background: "var(--danger-bg)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
        }}>
          {error}
        </div>
      )}

      {allVisible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {allVisible.map(([id, dl]) => {
            const isDone = dl.status === "completed";
            const isFail = dl.status === "failed";
            const barColor = isDone
              ? "var(--success)"
              : isFail
                ? "var(--danger)"
                : dl.status === "processing"
                  ? "var(--warning)"
                  : "var(--accent)";
            const label = isDone
              ? "✓ Done"
              : isFail
                ? "✕ Failed"
                : dl.status === "processing"
                  ? "Processing…"
                  : `${dl.percent}%`;

            return (
              <div key={id} style={{
                padding: "12px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-input)",
                border: "1px solid var(--glass-border)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{
                    color: "var(--text-secondary)", fontSize: 13,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                  }}>
                    {dl.title || id}
                  </span>
                  <span style={{
                    color: isDone ? "var(--success)" : isFail ? "var(--danger)" : "var(--text-muted)",
                    fontSize: 12, fontWeight: 600, marginLeft: 8,
                  }}>
                    {label}
                  </span>
                </div>
                <div style={{
                  height: 5, borderRadius: "var(--radius-full)",
                  background: "var(--border-secondary)", overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", borderRadius: "var(--radius-full)",
                    background: barColor, width: `${dl.percent}%`,
                    transition: "width 0.3s",
                    boxShadow: isDone ? "0 0 8px rgba(34, 197, 94, 0.5)" : "none",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { startDownload, subscribeDownloadProgress } from "../services/api";
import type { DownloadState } from "../services/api";

const QUALITIES = ["2160p", "1440p", "1080p", "720p", "480p", "360p"];
const C = {
  text: "var(--text-primary)", textSec: "var(--text-secondary)", textMuted: "var(--text-muted)",
  bg: "var(--bg-secondary)", bgInput: "var(--bg-input)", bgBar: "var(--border-secondary)",
  border: "var(--border-primary)", borderInput: "var(--border-input)", border2: "var(--border-secondary)",
  accent: "var(--accent)", success: "var(--success)", danger: "var(--danger)", warning: "var(--warning)",
  cardItem: "var(--bg-secondary)",
};

export default function DownloadPanel({ onDownloadComplete }: { onDownloadComplete: () => void }) {
  const [url, setUrl] = useState(""); const [quality, setQuality] = useState("1080p"); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [downloads, setDownloads] = useState<DownloadState>({});

  useEffect(() => { const close = subscribeDownloadProgress((s) => setDownloads(s)); return close; }, []);

  const handleDownload = async () => { if (!url.trim()) return; setError(""); setLoading(true); try { await startDownload(url.trim(), quality); setUrl(""); onDownloadComplete(); } catch (e: any) { setError(e.message || "Download failed"); } finally { setLoading(false); } };

  const allVisible = Object.entries(downloads).filter(([,d]) => d.percent < 100 || d.status === "completed" || d.status === "failed").reduce((acc, [id, d]) => { if (!acc.find(([i]) => i === id)) acc.push([id, d]); return acc; }, [] as [string, any][]);

  const inputStyle = { flex: 1, padding: "10px 14px", borderRadius: 8, border: `2px solid ${C.borderInput}`, background: C.bgInput, color: C.text, fontSize: 14 };
  const selectStyle = { padding: "10px 8px", borderRadius: 8, border: `2px solid ${C.borderInput}`, background: C.bgInput, color: C.text, fontSize: 14, cursor: "pointer" };
  const btnStyle = { padding: "10px 20px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontSize: 14, fontWeight: 600, cursor: url.trim() && !loading ? "pointer" : "not-allowed", opacity: url.trim() && !loading ? 1 : 0.5, whiteSpace: "nowrap" as const };

  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, color: C.textSec, marginBottom: 8 }}>⬇ Download Video</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleDownload()} placeholder="Paste YouTube URL to download…" disabled={loading} style={inputStyle} />
        <select value={quality} onChange={(e) => setQuality(e.target.value)} style={selectStyle}>{QUALITIES.map((q) => (<option key={q} value={q}>{q}</option>))}</select>
        <button onClick={handleDownload} disabled={!url.trim() || loading} style={btnStyle}>{loading ? "…" : "Download"}</button>
      </div>
      {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {allVisible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {allVisible.map(([id, dl]) => {
            const isDone = dl.status === "completed", isFail = dl.status === "failed";
            const barColor = isDone ? C.success : isFail ? C.danger : dl.status === "processing" ? C.warning : C.accent;
            const label = isDone ? "✓ Done" : isFail ? "✕ Failed" : dl.status === "processing" ? "Processing…" : `${dl.percent}%`;
            return (
              <div key={id} style={{ padding: "8px 10px", borderRadius: 6, background: C.cardItem, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{dl.title || id}</span>
                  <span style={{ color: isDone ? C.success : isFail ? C.danger : C.textMuted, marginLeft: 8 }}>{label}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: C.bgBar, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 2, background: barColor, width: `${dl.percent}%`, transition: "width 0.3s" }} /></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

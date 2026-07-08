import { useCallback } from "react";
import { useAppState } from "../context/AppContext";
import { fetchLibrary, deleteVideo, getMediaUrl } from "../services/api";
import type { LibraryVideo } from "../types";

const C = {
  text: "var(--text-primary)", textSec: "var(--text-secondary)", textMuted: "var(--text-muted)",
  bg: "var(--bg-secondary)", bgBase: "var(--bg-primary)", playerBg: "var(--player-bg)",
  border: "var(--border-primary)", border2: "var(--border-secondary)",
  accent: "var(--accent)", accentBg: "var(--accent-bg)", danger: "var(--danger)",
  card: "var(--card-bg)", queueActive: "var(--queue-active-bg)",
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
function formatDuration(sec: number | null): string { if (!sec) return ""; const m = Math.floor(sec / 60); return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`; }

export default function LibraryView() {
  const { library, setLibrary, playlist, setPlaylist } = useAppState();
  const refresh = useCallback(() => { fetchLibrary().then(setLibrary).catch(() => {}); }, [setLibrary]);
  const inPlaylistCount = library.filter((v) => playlist.some((p) => p.id === v.id)).length;

  return (
    <div style={{ padding: "16px", borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div><h3 style={{ fontSize: 15, color: C.text, margin: 0 }}>📂 Library</h3><span style={{ fontSize: 12, color: C.textMuted }}>{library.length} video{library.length !== 1 ? "s" : ""}{inPlaylistCount > 0 ? ` · ${inPlaylistCount} in queue` : ""}</span></div>
        <button onClick={refresh} style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${C.border2}`, background: "transparent", color: C.accent, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>🔄 Refresh</button>
      </div>
      {library.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: C.textMuted, fontSize: 13 }}>No videos yet. Paste a URL in the Download panel, then refresh.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {library.map((video) => {
            const inPlaylist = playlist.some((v) => v.id === video.id);
            return (
              <div key={video.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px", borderRadius: 8, background: inPlaylist ? C.queueActive : "transparent", border: inPlaylist ? `1px solid ${C.accent}` : "1px solid transparent" }}>
                <div style={{ width: 100, height: 56, borderRadius: 6, overflow: "hidden", background: C.playerBg, flexShrink: 0, position: "relative" }}>
                  {video.thumbnail ? <img src={getMediaUrl(video.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", background: C.border2 }} />}
                  {video.duration && <span style={{ position: "absolute", bottom: 2, right: 2, padding: "1px 4px", borderRadius: 3, background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: 10 }}>{formatDuration(video.duration)}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{video.title}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{video.quality} · {formatSize(video.fileSize)}</div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {inPlaylist ? (
                    <button onClick={() => setPlaylist(playlist.filter((v) => v.id !== video.id))} style={{ padding: "4px 8px", borderRadius: 4, border: `1px solid ${C.danger}`, background: "transparent", color: C.danger, cursor: "pointer", fontSize: 11 }}>Remove</button>
                  ) : (
                    <button onClick={() => { if (!playlist.find((v) => v.id === video.id)) setPlaylist([...playlist, video]); }} style={{ padding: "4px 8px", borderRadius: 4, border: `1px solid ${C.accent}`, background: "transparent", color: C.accent, cursor: "pointer", fontSize: 11 }}>+ Queue</button>
                  )}
                  <button onClick={async () => { if (confirm(`Delete "${video.title}"?`)) { try { await deleteVideo(video.id); setPlaylist(playlist.filter((v) => v.id !== video.id)); refresh(); } catch {} }}} style={{ padding: "4px 6px", borderRadius: 4, border: `1px solid ${C.border2}`, background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 11 }} title="Delete">🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

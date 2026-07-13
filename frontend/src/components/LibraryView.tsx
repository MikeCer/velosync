import { useCallback } from "react";
import { useAppState } from "../context/AppContext";
import { deleteVideo, deleteRouteVideo, getMediaUrl, fetchUnifiedLibrary } from "../services/api";
import type { LibraryVideo } from "../types";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
function formatDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function SourceBadge({ source, mode }: { source: "youtube" | "streetview"; mode?: "static" | "live" }) {
  if (source === "streetview" && mode === "live") {
    return (
      <span style={{
        padding: "1px 6px", borderRadius: "var(--radius-sm)",
        background: "rgba(6,182,212,0.15)", color: "#22d3ee",
        fontSize: 9, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        🌐 Live
      </span>
    );
  }
  const colors: Record<string, { bg: string; text: string; label: string }> = {
    youtube: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171", label: "YouTube" },
    streetview: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80", label: "Street View" },
  };
  const c = colors[source];
  return (
    <span style={{
      padding: "1px 6px", borderRadius: "var(--radius-sm)",
      background: c.bg, color: c.text,
      fontSize: 9, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.04em", flexShrink: 0,
    }}>
      {c.label}
    </span>
  );
}

export default function LibraryView() {
  const { library, setLibrary, playlist, setPlaylist } = useAppState();
  const refresh = useCallback(() => {
    fetchUnifiedLibrary().then(setLibrary).catch(() => {});
  }, [setLibrary]);
  const inPlaylistCount = library.filter((v) => playlist.some((p) => p.id === v.id)).length;

  const handleDelete = async (video: LibraryVideo) => {
    if (!confirm(`Delete "${video.title}"?`)) return;
    try {
      if (video.source === "streetview") {
        await deleteRouteVideo(video.id);
      } else {
        await deleteVideo(video.id);
      }
      setPlaylist(playlist.filter((v) => v.id !== video.id));
      refresh();
    } catch {}
  };

  return (
    <div className="glass-card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            📂 Library
          </h3>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, display: "block" }}>
            {library.length} video{library.length !== 1 ? "s" : ""}
            {inPlaylistCount > 0 ? ` · ${inPlaylistCount} in queue` : ""}
          </span>
        </div>
        <button
          onClick={refresh}
          style={{
            padding: "6px 14px", borderRadius: "var(--radius-md)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            background: "var(--accent-bg)",
            color: "var(--accent-light)", cursor: "pointer",
            fontSize: 12, fontWeight: 600,
            transition: "all var(--transition-fast)",
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {library.length === 0 ? (
        <div style={{
          padding: 32, textAlign: "center",
          color: "var(--text-muted)", fontSize: 13,
          background: "var(--bg-input)", borderRadius: "var(--radius-md)",
          border: "1px dashed var(--glass-border)",
        }}>
          No videos yet. Download videos or create Street View routes.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {library.map((video) => {
            const inPlaylist = playlist.some((v) => v.id === video.id);
            return (
              <div
                key={video.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px",
                  borderRadius: "var(--radius-md)",
                  background: inPlaylist ? "var(--queue-active-bg)" : "rgba(255,255,255,0.02)",
                  border: inPlaylist
                    ? "1px solid rgba(99, 102, 241, 0.25)"
                    : "1px solid transparent",
                  transition: "all var(--transition-fast)",
                }}
              >
                {/* Thumbnail */}
                <div style={{
                  width: 100, height: 56, borderRadius: "var(--radius-sm)",
                  overflow: "hidden", background: "var(--player-bg)", flexShrink: 0,
                  position: "relative",
                }}>
                  {video.thumbnail ? (
                    <img src={getMediaUrl(video.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", background: "var(--bg-input)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{video.source === "streetview" ? "🗺" : "🎬"}</div>
                  )}
                  {video.duration && (
                    <span style={{
                      position: "absolute", bottom: 3, right: 3,
                      padding: "1px 5px", borderRadius: "var(--radius-sm)",
                      background: "rgba(0,0,0,0.85)", color: "#fff",
                      fontSize: 10, fontWeight: 600,
                    }}>
                      {formatDuration(video.duration)}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 1 }}>
                    <SourceBadge source={video.source} mode={video.mode} />
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 500, color: "var(--text-primary)",
                    lineHeight: 1.3,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {video.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                    {video.source === "streetview"
                                          ? `🚲 ${video.distanceKm?.toFixed(1) ?? "?"} km · ${video.mode === "live" ? "🌐 Live" : video.quality}`
                      : `${video.quality} · ${formatSize(video.fileSize)}`
                    }
                    {video.description ? ` — ${video.description}` : ""}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {inPlaylist ? (
                    <button
                      onClick={() => setPlaylist(playlist.filter((v) => v.id !== video.id))}
                      style={{
                        padding: "5px 10px", borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--danger)",
                        background: "var(--danger-bg)",
                        color: "var(--danger)", cursor: "pointer",
                        fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (!playlist.find((v) => v.id === video.id)) {
                          setPlaylist([...playlist, video]);
                        }
                      }}
                      style={{
                        padding: "5px 10px", borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        background: "var(--accent-bg)",
                        color: "var(--accent-light)", cursor: "pointer",
                        fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      + Queue
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(video)}
                    style={{
                      padding: "5px 8px", borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--glass-border)",
                      background: "transparent",
                      color: "var(--text-muted)", cursor: "pointer",
                      fontSize: 14, lineHeight: 1,
                      transition: "all var(--transition-fast)",
                    }}
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

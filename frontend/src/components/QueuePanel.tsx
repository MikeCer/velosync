import { useAppState } from "../context/AppContext";

const C = {
  text: "var(--text-primary)", textSec: "var(--text-secondary)", textMuted: "var(--text-muted)",
  bg: "var(--bg-secondary)", border: "var(--border-primary)", border2: "var(--border-secondary)",
  accent: "var(--accent)", danger: "var(--danger)",
  card: "var(--card-bg)", queueActive: "var(--queue-active-bg)",
};

export default function QueuePanel() {
  const { playlist, setPlaylist, currentVideoIndex, setCurrentVideoIndex } = useAppState();
  return (
    <div style={{ padding: "16px", borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div><h3 style={{ fontSize: 15, color: C.text, margin: 0 }}>🎬 Queue</h3><span style={{ fontSize: 12, color: C.textMuted }}>{playlist.length} video{playlist.length !== 1 ? "s" : ""}</span></div>
        {playlist.length > 0 && <button onClick={() => setPlaylist([])} style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${C.border2}`, background: "transparent", color: C.danger, cursor: "pointer", fontSize: 13 }}>Clear</button>}
      </div>
      {playlist.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: C.textMuted, fontSize: 13 }}>Click "+ Queue" on library videos to build your session playlist.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {playlist.map((video, index) => (
            <div key={video.id} onClick={() => setCurrentVideoIndex(index)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: index === currentVideoIndex ? C.queueActive : "transparent", border: index === currentVideoIndex ? `1px solid ${C.accent}` : "1px solid transparent", cursor: "pointer" }}>
              <span style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: index === currentVideoIndex ? C.accent : C.border2, color: "#fff", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{index === currentVideoIndex ? "▶" : index + 1}</span>
              <span style={{ flex: 1, fontSize: 13, color: index === currentVideoIndex ? C.text : C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.title}</span>
              <button onClick={(e) => { e.stopPropagation(); setPlaylist(playlist.filter((_, i) => i !== index)); }} style={{ padding: "2px 6px", borderRadius: 4, border: `1px solid ${C.border2}`, background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 11 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

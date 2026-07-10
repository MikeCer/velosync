import { useAppState } from "../context/AppContext";

export default function QueuePanel() {
  const { playlist, setPlaylist, currentVideoIndex, setCurrentVideoIndex } = useAppState();

  return (
    <div className="glass-card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            🎬 Queue
          </h3>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, display: "block" }}>
            {playlist.length} video{playlist.length !== 1 ? "s" : ""}
          </span>
        </div>
        {playlist.length > 0 && (
          <button
            onClick={() => setPlaylist([])}
            style={{
              padding: "6px 14px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--danger)",
              background: "var(--danger-bg)",
              color: "var(--danger)", cursor: "pointer",
              fontSize: 12, fontWeight: 600,
              transition: "all var(--transition-fast)",
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {playlist.length === 0 ? (
        <div style={{
          padding: 32, textAlign: "center",
          color: "var(--text-muted)", fontSize: 13,
          background: "var(--bg-input)", borderRadius: "var(--radius-md)",
          border: "1px dashed var(--glass-border)",
        }}>
          Add videos from the Library tab to build your session playlist
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {playlist.map((video, index) => (
            <div
              key={video.id}
              onClick={() => setCurrentVideoIndex(index)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                background: index === currentVideoIndex ? "var(--queue-active-bg)" : "transparent",
                border: index === currentVideoIndex
                  ? "1px solid rgba(99, 102, 241, 0.3)"
                  : "1px solid transparent",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
              }}
            >
              {/* Index / Play indicator */}
              <div style={{
                width: 28, height: 28, borderRadius: "var(--radius-sm)",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: index === currentVideoIndex
                  ? "var(--accent-gradient)"
                  : "var(--bg-input)",
                color: "#fff", fontSize: 11, fontWeight: 700,
                flexShrink: 0,
                boxShadow: index === currentVideoIndex ? "var(--shadow-glow)" : "none",
              }}>
                {index === currentVideoIndex ? "▶" : index + 1}
              </div>

              {/* Title */}
              <span style={{
                flex: 1, fontSize: 13, fontWeight: index === currentVideoIndex ? 600 : 400,
                color: index === currentVideoIndex ? "var(--text-primary)" : "var(--text-secondary)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {video.title}
              </span>

              {/* Remove button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPlaylist(playlist.filter((_, i) => i !== index));
                }}
                style={{
                  padding: "4px 8px", borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--glass-border)",
                  background: "transparent",
                  color: "var(--text-muted)", cursor: "pointer",
                  fontSize: 13, lineHeight: 1,
                  transition: "all var(--transition-fast)",
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useCallback, useState, useRef } from "react";
import { useAppState } from "../context/AppContext";
import { useSessionTimer } from "../hooks/useSessionTimer";
import { fetchUnifiedLibrary } from "../services/api";
import VideoPlayer from "./VideoPlayer";
import SpeedDisplay from "./SpeedDisplay";
import SpeedSlider from "./SpeedSlider";
import AudioControl from "./AudioControl";
import SpeedSourceSelector from "./SpeedSourceSelector";
import SessionBar from "./SessionBar";
import RouteMapOverlay from "./RouteMapOverlay";
import LibraryView from "./LibraryView";
import DownloadPanel from "./DownloadPanel";
import QueuePanel from "./QueuePanel";

export default function Dashboard() {
  const { playlist, currentVideoIndex, isPlaying, setIsPlaying, setLibrary, speedSource, currentSpeedKmh, manualSpeedKmh } = useAppState();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"queue" | "library" | "download">("queue");
  const playerVideoRef = useRef<HTMLVideoElement | null>(null);
  const autoPausedRef = useRef(false);

  const currentVideo = playlist[currentVideoIndex];
  const isStreetView = currentVideo?.source === "streetview";

  useSessionTimer();

  useEffect(() => {
    fetchUnifiedLibrary().then(setLibrary).catch(() => {});
  }, [setLibrary]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const video = document.querySelector("video");
      if (video && video !== playerVideoRef.current) {
        playerVideoRef.current = video;
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (speedSource === "manual") {
        if (manualSpeedKmh <= 0 && isPlaying) {
          autoPausedRef.current = true;
          setIsPlaying(false);
        } else if (manualSpeedKmh > 0 && !isPlaying && autoPausedRef.current) {
          autoPausedRef.current = false;
          setIsPlaying(true);
        }
      } else {
        if (currentSpeedKmh <= 0 && isPlaying) {
          autoPausedRef.current = true;
          setIsPlaying(false);
        } else if (currentSpeedKmh > 0 && !isPlaying && autoPausedRef.current) {
          autoPausedRef.current = false;
          setIsPlaying(true);
        }
      }
    }, [currentSpeedKmh, manualSpeedKmh, isPlaying, speedSource, setIsPlaying]);

  const handleStop = () => {
    autoPausedRef.current = false;
    setIsPlaying(false);
  };
  const handleStart = () => {
    autoPausedRef.current = false;
    setIsPlaying(true);
  };
  const handleDownloadComplete = useCallback(() => {}, []);

  return (
    <div style={{
      background: "var(--bg-primary)",
      minHeight: "100vh",
      color: "var(--text-primary)",
    }}>
      {/* Main content area */}
      <div style={{
        display: "flex", gap: 0,
        padding: isFullscreen ? 0 : "20px",
        maxWidth: 1800, margin: "0 auto",
        flexWrap: "wrap",
      }}>
        {/* Left: Video + Controls */}
        <div style={{
          flex: isFullscreen ? "1 1 100%" : "1 1 500px",
          minWidth: 0,
          maxWidth: isFullscreen ? "100%" : "100%",
        }}>
          <VideoPlayer />

          {!isFullscreen && playlist.length > 0 && (
            <div className="glass-card" style={{
              marginTop: 16, padding: "20px 24px",
            }}>
              <SpeedDisplay />
              <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginTop: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <SpeedSlider />
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", gap: 12, alignItems: "center" }}>
                  <AudioControl videoRef={playerVideoRef} />
                  {!isPlaying ? (
                    <button
                      onClick={handleStart}
                      disabled={playlist.length === 0}
                      className="btn-gradient"
                      style={{
                        padding: "12px 32px", fontSize: 16,
                        whiteSpace: "nowrap",
                      }}
                    >
                      ▶ Start
                    </button>
                  ) : (
                    <button
                      onClick={handleStop}
                      style={{
                        padding: "12px 32px", borderRadius: "var(--radius-lg)",
                        border: "none",
                        background: "var(--danger)",
                        color: "#fff", fontSize: 16, fontWeight: 600,
                        cursor: "pointer", whiteSpace: "nowrap",
                        boxShadow: "0 2px 12px rgba(239, 68, 68, 0.4)",
                        transition: "all var(--transition-base)",
                      }}>
                      ⏹ Stop
                    </button>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <SpeedSourceSelector />
                <SessionBar />
              </div>
            </div>
          )}

          {!isFullscreen && isStreetView && (
            <div style={{ marginTop: 16 }}>
                        <RouteMapOverlay />
            </div>
          )}
        </div>

        {/* Right sidebar with tab navigation */}
        {!isFullscreen && (
          <div style={{
            flex: "0 0 380px",
            marginLeft: 20,
            display: "flex", flexDirection: "column", gap: 0,
            minWidth: 320,
          }}>
            {/* Tab bar */}
            <div style={{
              display: "flex", gap: 4, marginBottom: 16,
              padding: 4, borderRadius: "var(--radius-lg)",
              background: "var(--bg-input)",
              border: "1px solid var(--glass-border)",
            }}>
              {([
                { key: "queue", label: "🎬 Queue", badge: playlist.length },
                { key: "download", label: "⬇ Download", badge: null },
                { key: "library", label: "📂 Library", badge: null },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSidebarTab(tab.key)}
                  style={{
                    flex: 1, padding: "10px 12px", borderRadius: "var(--radius-md)",
                    border: "none",
                    background: sidebarTab === tab.key ? "var(--accent-bg)" : "transparent",
                    color: sidebarTab === tab.key ? "var(--accent-light)" : "var(--text-muted)",
                    cursor: "pointer", fontSize: 13, fontWeight: 600,
                    transition: "all var(--transition-fast)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  {tab.label}
                  {tab.badge != null && tab.badge > 0 && (
                    <span style={{
                      background: "var(--accent-gradient)",
                      color: "#fff", fontSize: 10, fontWeight: 700,
                      padding: "1px 7px", borderRadius: "var(--radius-full)",
                      minWidth: 20, textAlign: "center",
                    }}>{tab.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {sidebarTab === "download" && <DownloadPanel onDownloadComplete={handleDownloadComplete} />}
              {sidebarTab === "queue" && <QueuePanel />}
              {sidebarTab === "library" && <LibraryView />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

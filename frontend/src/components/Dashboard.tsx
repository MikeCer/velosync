import { useEffect, useCallback, useState, useRef } from "react";
import { useAppState } from "../context/AppContext";
import { useTheme } from "../context/ThemeContext";
import { useSessionTimer } from "../hooks/useSessionTimer";
import { fetchLibrary } from "../services/api";
import VideoPlayer from "./VideoPlayer";
import SpeedDisplay from "./SpeedDisplay";
import SpeedSlider from "./SpeedSlider";
import AudioControl from "./AudioControl";
import SpeedSourceSelector from "./SpeedSourceSelector";
import SessionBar from "./SessionBar";
import MapOverlay from "./MapOverlay";
import SettingsDialog from "./SettingsDialog";
import LibraryView from "./LibraryView";
import DownloadPanel from "./DownloadPanel";
import QueuePanel from "./QueuePanel";

const C = {
  bg: "var(--bg-tertiary)",
  border: "var(--border-primary)",
  text: "var(--text-primary)",
  textMuted: "var(--text-muted)",
  accent: "var(--accent)",
  success: "var(--success)",
  danger: "var(--danger)",
  card: "var(--bg-secondary)",
  cardBorder: "var(--border-primary)",
  btnGlass: "var(--btn-glass)",
};

const ICONS = {
  sun: "\u2600\uFE0F",
  moon: "\uD83C\uDF19",
  bike: "\uD83D\uDEB4",
  gear: "\u2699",
  play: "\u25B6",
  stop: "\u23F9",
};

export default function Dashboard() {
  const { playlist, isPlaying, setIsPlaying, setLibrary, speedSource, currentSpeedKmh } = useAppState();
  const { theme, toggleTheme } = useTheme();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const playerVideoRef = useRef<HTMLVideoElement | null>(null);
  const autoPausedRef = useRef(false);

  useSessionTimer();

  useEffect(() => {
    fetchLibrary().then(setLibrary).catch(() => {});
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

  // Auto-pause/resume when hardware sensor speed reaches zero
  useEffect(() => {
    if (speedSource === "manual") {
      autoPausedRef.current = false;
      return;
    }
    if (currentSpeedKmh <= 0 && isPlaying) {
      autoPausedRef.current = true;
      setIsPlaying(false);
    } else if (currentSpeedKmh > 0 && !isPlaying && autoPausedRef.current) {
      autoPausedRef.current = false;
      setIsPlaying(true);
    }
  }, [currentSpeedKmh, isPlaying, speedSource, setIsPlaying]);

  const handleStop = () => {
    autoPausedRef.current = false;
    setIsPlaying(false);
  };
  const handleStart = () => {
    autoPausedRef.current = false;
    setIsPlaying(true);
  };
  const handleDownloadComplete = useCallback(() => {}, []);

  const border = "1px solid " + C.cardBorder;
  const headerBorder = "1px solid " + C.border;

  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      background: C.bg, minHeight: "100vh", color: C.text,
    }}>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {!isFullscreen && (
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 24px", background: C.bg, borderBottom: headerBorder,
          position: "sticky", top: 0, zIndex: 100,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={toggleTheme}
              title="Toggle theme"
              style={{
                padding: "4px 8px", borderRadius: 20, border: border,
                background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 16,
              }}
            >
              {theme === "dark" ? ICONS.sun : ICONS.moon}
            </button>
            <span style={{ fontSize: 20, fontWeight: 700, color: C.accent }}>{ICONS.bike} VeloSync</span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            style={{
              padding: "6px 14px", borderRadius: 20, border: border,
              background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 16,
            }}
          >
            {ICONS.gear}
          </button>
        </header>
      )}

      <div style={{ display: "flex", gap: 0, padding: isFullscreen ? 0 : "24px", maxWidth: 1800, margin: "0 auto" }}>
        <div style={{ flex: isFullscreen ? "1 1 100%" : "1 1 0", minWidth: 0, maxWidth: isFullscreen ? "100%" : "68%" }}>
          <VideoPlayer />

          {!isFullscreen && playlist.length > 0 && (
            <div style={{
              marginTop: 12, padding: "14px 16px", borderRadius: 12,
              background: C.card, border: border,
            }}>
              <SpeedDisplay />
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <SpeedSlider />
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", gap: 12, alignItems: "center", paddingTop: 2 }}>
                  <AudioControl videoRef={playerVideoRef} />
                  {!isPlaying ? (
                    <button
                      onClick={handleStart}
                      disabled={playlist.length === 0}
                      style={{
                        padding: "10px 28px", borderRadius: 24, border: "none",
                        background: playlist.length > 0 ? C.success : C.cardBorder,
                        color: "#fff", fontSize: 15, fontWeight: 600,
                        cursor: playlist.length > 0 ? "pointer" : "not-allowed",
                        opacity: playlist.length > 0 ? 1 : 0.5, whiteSpace: "nowrap",
                      }}>
                      {ICONS.play} Start
                    </button>
                  ) : (
                    <button
                      onClick={handleStop}
                      style={{ padding: "10px 28px", borderRadius: 24, border: "none", background: C.danger, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                      {ICONS.stop} Stop
                    </button>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <SpeedSourceSelector />
                <SessionBar />
              </div>
            </div>
          )}

          {!isFullscreen && (
            <div style={{ marginTop: 16 }}>
              <MapOverlay />
            </div>
          )}
        </div>

        {!isFullscreen && (
          <div style={{ flex: "0 0 370px", marginLeft: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <DownloadPanel onDownloadComplete={handleDownloadComplete} />
            <QueuePanel />
            <LibraryView />
          </div>
        )}
      </div>
    </div>
  );
}

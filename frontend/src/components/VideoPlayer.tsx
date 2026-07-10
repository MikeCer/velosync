import { useEffect, useRef, useCallback, useState } from "react";
import { useAppState } from "../context/AppContext";
import { getMediaUrl } from "../services/api";
import SpeedDisplay from "./SpeedDisplay";
import SpeedSlider from "./SpeedSlider";
import AudioControl from "./AudioControl";
import HudOverlay from "./HudOverlay";

export default function VideoPlayer() {
  const { playlist, currentVideoIndex, playbackRate, isPlaying, setIsPlaying, setCurrentVideoIndex, effectiveSpeed } = useAppState();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showSpeedGauge, setShowSpeedGauge] = useState(() => {
    return localStorage.getItem("fullscreenSpeedGauge") === "true";
  });
    const [showHud, setShowHud] = useState(() => {
      return localStorage.getItem("fullscreenHud") === "true";
    });
  const hideTimerRef = useRef<number | null>(null);

  const currentVideo = playlist[currentVideoIndex];

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const applyRate = () => {
      if (Math.abs(video.playbackRate - playbackRate) > 0.01) {
        video.playbackRate = playbackRate;
      }
    };
    applyRate();
    const interval = setInterval(applyRate, 200);
    return () => clearInterval(interval);
  }, [playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.preservesPitch = true;
      (video as any).mozPreservesPitch = true;
    }
  }, [currentVideo?.filename]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const handleMouseMove = useCallback(() => {
    if (!isFullscreen) return;
    setShowOverlay(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setShowOverlay(false), 3000);
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  const toggleSpeedGauge = useCallback(() => {
    setShowSpeedGauge((prev) => {
      const next = !prev;
      localStorage.setItem("fullscreenSpeedGauge", String(next));
      return next;
    });
  }, []);

    const toggleHud = useCallback(() => {
      setShowHud((prev) => {
        const next = !prev;
        localStorage.setItem("fullscreenHud", String(next));
        return next;
      });
    }, []);

  const handleEnded = useCallback(() => {
    if (currentVideoIndex < playlist.length - 1) {
      setCurrentVideoIndex(currentVideoIndex + 1);
    } else {
      setIsPlaying(false);
    }
  }, [currentVideoIndex, playlist.length, setCurrentVideoIndex, setIsPlaying]);

  if (!currentVideo) {
    return (
      <div style={{
        aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#000", borderRadius: 12, color: "#888", fontSize: 15, border: "1px solid #222",
      }}>
        No video in queue — add videos from your library
      </div>
    );
  }

  const src = getMediaUrl(currentVideo.filename);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onTouchStart={handleMouseMove}
      style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000" }}
    >
      <video
        ref={videoRef}
        src={src}
        controls={false}
        playsInline
        onEnded={handleEnded}
        style={{ width: "100%", display: "block" }}
      />

      {/* Persistent speed gauge in top-left (fullscreen only) */}
      {isFullscreen && showSpeedGauge && (
        <div style={{
          position: "absolute", top: 16, left: 16,
          padding: "10px 18px", borderRadius: 14,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.12)",
          display: "flex", alignItems: "baseline", gap: 6,
          pointerEvents: "none",
          zIndex: 10,
        }}>
          <span style={{
            fontSize: 40, fontWeight: 800, color: "#4ade80",
            lineHeight: 1, fontVariantNumeric: "tabular-nums",
          }}>
            {effectiveSpeed.toFixed(1)}
          </span>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>
            km/h
          </span>
        </div>
      )}

            {/* HUD overlay (fullscreen only, persistent) */}
            {isFullscreen && <HudOverlay visible={showHud} />}

      {isFullscreen && showOverlay && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "20px 28px 24px",
          background: "linear-gradient(transparent, rgba(0,0,0,0.85) 40%)",
          pointerEvents: "auto",
        }}>
          <SpeedDisplay />
          <div style={{ marginTop: 12 }}>
            <SpeedSlider />
          </div>
          <div style={{
            marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 14, color: "#fff",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
                {currentVideoIndex + 1}/{playlist.length} — {currentVideo.title}
              </span>
              <AudioControl videoRef={videoRef} compact />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {currentVideoIndex > 0 && (
                <button onClick={() => setCurrentVideoIndex(currentVideoIndex - 1)}
                  style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 14, cursor: "pointer" }}>
                  ⏮
                </button>
              )}
              {currentVideoIndex < playlist.length - 1 && (
                <button onClick={() => setCurrentVideoIndex(currentVideoIndex + 1)}
                  style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 14, cursor: "pointer" }}>
                  ⏭
                </button>
              )}
              <button
                onClick={toggleSpeedGauge}
                title={showSpeedGauge ? "Hide speed gauge" : "Show speed gauge"}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: "none",
                  background: showSpeedGauge ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.15)",
                  color: "#fff", fontSize: 16, cursor: "pointer",
                }}
              >
                ⚡
              </button>
                            <button
                              onClick={toggleHud}
                              title={showHud ? "Hide telemetry HUD" : "Show telemetry HUD"}
                              style={{
                                padding: "6px 14px", borderRadius: 8, border: "none",
                                background: showHud ? "rgba(96,165,250,0.25)" : "rgba(255,255,255,0.15)",
                                color: "#fff", fontSize: 16, cursor: "pointer",
                              }}
                            >
                              📊
                            </button>
              <button onClick={toggleFullscreen}
                style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 16, cursor: "pointer" }}>
                ↙
              </button>
            </div>
          </div>
        </div>
      )}

      {!isFullscreen && (
        <>
          <div style={{
            position: "absolute", top: 12, left: 12, padding: "6px 14px", borderRadius: 8,
            background: "rgba(0,0,0,0.75)", color: "#fff", fontSize: 14, fontWeight: 500,
            maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {currentVideoIndex + 1} / {playlist.length} — {currentVideo.title}
          </div>
          <div style={{ display: "flex", gap: 8, position: "absolute", bottom: 16, right: 16 }}>
            {currentVideoIndex > 0 && (
              <button onClick={() => setCurrentVideoIndex(currentVideoIndex - 1)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 16, cursor: "pointer" }}>
                ⏮ Prev
              </button>
            )}
            {currentVideoIndex < playlist.length - 1 && (
              <button onClick={() => setCurrentVideoIndex(currentVideoIndex + 1)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 16, cursor: "pointer" }}>
                Next ⏭
              </button>
            )}
            <button onClick={toggleFullscreen}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 18, cursor: "pointer" }}
              title="Toggle fullscreen">
              ↗
            </button>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useRef, useCallback, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import { setOptions } from "@googlemaps/js-api-loader";
import { useAppState } from "../context/AppContext";
import type { WaypointWithHeading } from "../types";

interface StreetViewPlayerProps {
  routeId: string;
  denseWaypoints: WaypointWithHeading[];
  /** Total duration in seconds of the route (used as baseline for playback) */
  routeDuration: number;
  visible: boolean;
}

/**
 * Renders a Google StreetViewPanorama and advances programmatically
 * through a sequence of waypoints at the effective playback rate.
 *
 * All HUD overlays, fullscreen, and queue controls mount identically
 * on top of this component via VideoPlayer.
 */
export default function StreetViewPlayer({
  routeId,
  denseWaypoints,
  routeDuration,
  visible,
}: StreetViewPlayerProps) {
  const {
    googleApiKey,
    isPlaying,
    playbackRate,
    sessionElapsed,
    setSessionElapsed,
    effectiveSpeed,
  } = useAppState();

  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const lastFrameRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [svLoaded, setSvLoaded] = useState(false);
  const [svError, setSvError] = useState("");

  // ── Lazy-init Google Maps JS API for StreetView ───────
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    if (!googleApiKey) return;
    let cancelled = false;
    void (async () => {
      try {
        setOptions({ key: googleApiKey, v: "weekly" });
        // Wait for Maps to be available
        await google.maps.importLibrary("streetView");
        if (!cancelled) setMapsReady(true);
      } catch {
        if (!cancelled) setSvError("Failed to load Google Maps Street View");
      }
    })();
    return () => { cancelled = true; };
  }, [googleApiKey]);

  // ── Create StreetViewPanorama ─────────────────────────
  useEffect(() => {
    if (!mapsReady || !containerRef.current || denseWaypoints.length === 0) return;

    const first = denseWaypoints[0];
    const panorama = new google.maps.StreetViewPanorama(containerRef.current, {
      position: { lat: first.lat, lng: first.lng },
      pov: { heading: first.heading, pitch: 0 },
      zoom: 1,
      addressControl: false,
      showRoadLabels: false,
      fullscreenControl: false,
      linksControl: false,
      panControl: false,
      enableCloseButton: false,
      visible: true,
    });

    panoramaRef.current = panorama;
    setSvLoaded(true);
    setSvError("");

    return () => {
      panoramaRef.current = null;
      // panorama is bound to the container DOM; unmount cleans up
    };
  }, [mapsReady, denseWaypoints[0]?.lat, denseWaypoints[0]?.lng]);

  // ── Frame advancement loop ────────────────────────────
  // Each second of sessionElapsed corresponds to one "frame" in the waypoint
  // sequence, scaled by playbackRate. We advance the StreetView position
  // and heading on each frame tick.
  useEffect(() => {
    if (!isPlaying || !panoramaRef.current || denseWaypoints.length < 2) return;

    let lastReportedElapsed = sessionElapsed;

    const tick = () => {
      const pano = panoramaRef.current;
      if (!pano) return;

      // Calculate which frame index we should be at
      const rawFrame = sessionElapsed * playbackRate;
      const frameIndex = Math.min(Math.floor(rawFrame), denseWaypoints.length - 1);

      if (frameIndex !== lastFrameRef.current) {
        lastFrameRef.current = frameIndex;
        const wp = denseWaypoints[frameIndex];
        pano.setPosition({ lat: wp.lat, lng: wp.lng });
        pano.setPov({ heading: wp.heading, pitch: 0 });
      }

      // Check if we reached the end
      if (frameIndex >= denseWaypoints.length - 1) {
        // Route complete — stop playing
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, playbackRate, sessionElapsed, denseWaypoints]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        inset: 0,
        background: "#000",
      }}
    >
      {!mapsReady && !svError && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,0.6)", fontSize: 14,
        }}>
          Loading Street View…
        </div>
      )}
      {svError && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "#f87171", fontSize: 14, padding: 20, textAlign: "center",
        }}>
          {svError}
        </div>
      )}
    </div>
  );
}
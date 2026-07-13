import { useEffect, useRef, useState } from "react";
import { useAppState } from "../context/AppContext";
import { useGoogleMapsLoader } from "../hooks/useGoogleMapsLoader";
import type { WaypointWithHeading } from "../types";

interface StreetViewPlayerProps {
    denseWaypoints: WaypointWithHeading[];
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
    denseWaypoints,
    visible,
}: StreetViewPlayerProps) {
    const {
      googleApiKey,
      isPlaying,
      playbackRate,
      sessionElapsed,
    } = useAppState();

    const containerRef = useRef<HTMLDivElement>(null);
    const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
    const panoCreatedRef = useRef(false);
    const lastFrameRef = useRef(-1);
    const lastPositionUpdateRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const [svError, setSvError] = useState("");

    // Keep sessionElapsed in a ref so the RAF loop doesn't depend on reactive state
    const sessionElapsedRef = useRef(sessionElapsed);
    sessionElapsedRef.current = sessionElapsed;
    const playbackRateRef = useRef(playbackRate);
    playbackRateRef.current = playbackRate;

    // ── Load Google Maps JS API ──────────────────────────
    const hasKey = googleApiKey.trim().length > 0;
    const { isLoaded: mapsReady, loadError } = useGoogleMapsLoader(googleApiKey);

    // ── Create StreetViewPanorama ─────────────────────────
    useEffect(() => {
      if (!hasKey || !mapsReady || !containerRef.current || denseWaypoints.length === 0) return;
      if (panoCreatedRef.current) return;

      const first = denseWaypoints[0];
      try {
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

        // Listen for status changes to detect coverage or API issues
        panorama.addListener("status_changed", () => {
          const status = panorama.getStatus();
          if (status === "OK") {
            setSvError("");
          } else if (status === "ZERO_RESULTS") {
            setSvError("No Street View coverage at this location");
          } else if (status === "UNKNOWN_ERROR") {
            setSvError("Street View API error — check your API key and billing");
          }
        });

        panoramaRef.current = panorama;
        panoCreatedRef.current = true;
        setSvError("");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setSvError(`Failed to create Street View: ${message}`);
      }

      return () => {
        // Clean up listeners on the panorama before nulling ref
        if (panoramaRef.current) {
          google.maps.event.clearInstanceListeners(panoramaRef.current);
        }
        panoCreatedRef.current = false;
        panoramaRef.current = null;
      };
    }, [hasKey, mapsReady, denseWaypoints]);

    // ── Frame advancement loop ────────────────────────────
        // Use refs for elapsed/rate to avoid re-creating the RAF loop on every
        // state change, which would trigger excessive tile requests. Position
        // updates are throttled to ~500ms minimum interval to avoid 429 errors.
        useEffect(() => {
          if (!isPlaying || !panoramaRef.current || denseWaypoints.length < 2) {
            lastFrameRef.current = -1;
            return;
          }

          const MIN_POSITION_INTERVAL_MS = 500; // Throttle setPosition to avoid tile server 429

          const tick = () => {
            const pano = panoramaRef.current;
            if (!pano) return;

            const rawFrame = sessionElapsedRef.current * playbackRateRef.current;
            const frameIndex = Math.min(Math.floor(rawFrame), denseWaypoints.length - 1);

            if (frameIndex !== lastFrameRef.current) {
              const now = performance.now();
              // Only update position if enough time has passed since last update
              if (now - lastPositionUpdateRef.current >= MIN_POSITION_INTERVAL_MS || lastFrameRef.current === -1) {
                lastPositionUpdateRef.current = now;
                lastFrameRef.current = frameIndex;
                const wp = denseWaypoints[frameIndex];
                pano.setPosition({ lat: wp.lat, lng: wp.lng });
                pano.setPov({ heading: wp.heading, pitch: 0 });
              }
            }

            if (frameIndex >= denseWaypoints.length - 1) {
              return; // Route complete
            }

            rafRef.current = requestAnimationFrame(tick);
          };

          rafRef.current = requestAnimationFrame(tick);

          return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
          };
        }, [isPlaying, denseWaypoints]);

    const errorMessage = svError || (loadError ? `Google Maps error: ${loadError.message}` : "");

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
        {!hasKey && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#fbbf24", fontSize: 14, padding: 20, textAlign: "center",
          }}>
            Google API key required — add it in Settings to use Live Street View
          </div>
        )}
        {hasKey && !mapsReady && !errorMessage && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.6)", fontSize: 14,
          }}>
            Loading Street View…
          </div>
        )}
        {errorMessage && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#f87171", fontSize: 14, padding: 20, textAlign: "center",
          }}>
            {errorMessage}
          </div>
        )}
      </div>
    );
}
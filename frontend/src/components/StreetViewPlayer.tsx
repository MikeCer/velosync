import { useEffect, useRef, useState } from "react";
import { useAppState } from "../context/AppContext";
import { useGoogleMapsLoader } from "../hooks/useGoogleMapsLoader";
import type { WaypointWithHeading } from "../types";

interface StreetViewPlayerProps {
  denseWaypoints: WaypointWithHeading[];
  fullscreen: boolean;
  visible: boolean;
}

type LayerIndex = 0 | 1;

const CROSSFADE_MS = 450;
const PREFETCH_SETTLE_MS = 300;

const PANORAMA_OPTIONS: google.maps.StreetViewPanoramaOptions = {
  zoom: 1,
  addressControl: false,
  showRoadLabels: false,
  fullscreenControl: false,
  linksControl: false,
  panControl: false,
  enableCloseButton: false,
  visible: true,
};

export default function StreetViewPlayer({
  denseWaypoints,
  fullscreen,
  visible,
}: StreetViewPlayerProps) {
  const {
    googleApiKey,
    isPlaying,
    playbackRate,
    sessionElapsed,
  } = useAppState();

  const layer0Ref = useRef<HTMLDivElement>(null);
  const layer1Ref = useRef<HTMLDivElement>(null);
  const panoramasRef = useRef<
    [google.maps.StreetViewPanorama | null, google.maps.StreetViewPanorama | null]
  >([null, null]);
  const requestedFramesRef = useRef<[number, number]>([-1, -1]);
  const readyFramesRef = useRef<[number, number]>([-1, -1]);
  const readyAtRef = useRef<[number, number]>([0, 0]);
  const inFlightRef = useRef<[boolean, boolean]>([false, false]);
  const failedFramesRef = useRef<[number, number]>([-1, -1]);
  const activeLayerRef = useRef<LayerIndex>(0);
  const transitionLockedUntilRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const sessionElapsedRef = useRef(sessionElapsed);
  const playbackRateRef = useRef(playbackRate);

  const [activeLayer, setActiveLayer] = useState<LayerIndex>(0);
  const [initialized, setInitialized] = useState(false);
  const [svError, setSvError] = useState("");

  sessionElapsedRef.current = sessionElapsed;
  playbackRateRef.current = playbackRate;

  const hasKey = googleApiKey.trim().length > 0;
  const { isLoaded: mapsReady, loadError } = useGoogleMapsLoader(googleApiKey);

  useEffect(() => {
    if (
      !hasKey ||
      !mapsReady ||
      !layer0Ref.current ||
      !layer1Ref.current ||
      denseWaypoints.length === 0 ||
      initializedRef.current
    ) {
      return;
    }

    const containers = [layer0Ref.current, layer1Ref.current] as const;
    const initialFrame = Math.min(
      Math.floor(sessionElapsedRef.current * playbackRateRef.current),
      denseWaypoints.length - 1,
    );
    const prefetchedFrame = Math.min(
      initialFrame + Math.max(1, Math.ceil(playbackRateRef.current)),
      denseWaypoints.length - 1,
    );

    try {
      ([initialFrame, prefetchedFrame] as const).forEach((frameIndex, layer) => {
        const wp = denseWaypoints[frameIndex];
        requestedFramesRef.current[layer] = frameIndex;
        inFlightRef.current[layer] = true;

        const panorama = new google.maps.StreetViewPanorama(containers[layer], {
          ...PANORAMA_OPTIONS,
          position: { lat: wp.lat, lng: wp.lng },
          pov: { heading: wp.heading, pitch: 0 },
        });

        panorama.addListener("status_changed", () => {
          const status = panorama.getStatus();
          const requestedFrame = requestedFramesRef.current[layer];
          const isActive = activeLayerRef.current === layer;
          inFlightRef.current[layer] = false;

          if (status === "OK") {
            readyFramesRef.current[layer] = requestedFrame;
            failedFramesRef.current[layer] = -1;
            readyAtRef.current[layer] = performance.now() + PREFETCH_SETTLE_MS;
            if (isActive) setSvError("");
          } else {
            readyFramesRef.current[layer] = -1;
            failedFramesRef.current[layer] = requestedFrame;
            const desiredFrame = Math.min(
              Math.floor(sessionElapsedRef.current * playbackRateRef.current),
              denseWaypoints.length - 1,
            );
            if (isActive && status === "ZERO_RESULTS") {
              setSvError("No Street View coverage at this location");
            } else if (isActive && status === "UNKNOWN_ERROR") {
              setSvError("Street View API error - check your API key and billing");
            } else if (requestedFrame === desiredFrame) {
              setSvError("Unable to preload Street View at the next waypoint");
            }
          }
        });

        panoramasRef.current[layer] = panorama;
      });

      readyFramesRef.current[0] = initialFrame;
      activeLayerRef.current = 0;
      setActiveLayer(0);
      initializedRef.current = true;
      setInitialized(true);
      setSvError("");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setSvError(`Failed to create Street View: ${message}`);
    }

    return () => {
      panoramasRef.current.forEach((panorama) => {
        if (panorama) google.maps.event.clearInstanceListeners(panorama);
      });
      panoramasRef.current = [null, null];
      requestedFramesRef.current = [-1, -1];
      readyFramesRef.current = [-1, -1];
      inFlightRef.current = [false, false];
      failedFramesRef.current = [-1, -1];
      transitionLockedUntilRef.current = 0;
      initializedRef.current = false;
      setInitialized(false);
    };
  }, [denseWaypoints, hasKey, mapsReady]);

  useEffect(() => {
    const resizePanoramas = () => {
      panoramasRef.current.forEach((panorama) => {
        if (panorama) google.maps.event.trigger(panorama, "resize");
      });
    };
    const frameId = requestAnimationFrame(resizePanoramas);
    const timeoutId = window.setTimeout(resizePanoramas, CROSSFADE_MS);
    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timeoutId);
    };
  }, [fullscreen]);

  useEffect(() => {
    if (!isPlaying || !initialized || denseWaypoints.length < 2) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const loadFrame = (layer: LayerIndex, frameIndex: number) => {
      const panorama = panoramasRef.current[layer];
      const wp = denseWaypoints[frameIndex];
      if (
        !panorama ||
        !wp ||
        inFlightRef.current[layer] ||
        failedFramesRef.current[layer] === frameIndex ||
        (
          requestedFramesRef.current[layer] === frameIndex &&
          readyFramesRef.current[layer] === frameIndex
        )
      ) {
        return;
      }

      requestedFramesRef.current[layer] = frameIndex;
      readyFramesRef.current[layer] = -1;
      readyAtRef.current[layer] = Number.POSITIVE_INFINITY;
      inFlightRef.current[layer] = true;
      failedFramesRef.current[layer] = -1;
      panorama.setPov({ heading: wp.heading, pitch: 0 });
      panorama.setPosition({ lat: wp.lat, lng: wp.lng });
    };

    const tick = () => {
      const now = performance.now();
      const rawFrame = sessionElapsedRef.current * playbackRateRef.current;
      const desiredFrame = Math.min(
        Math.floor(rawFrame),
        denseWaypoints.length - 1,
      );
      const active = activeLayerRef.current;
      const inactive = (active === 0 ? 1 : 0) as LayerIndex;
      const activeFrame = readyFramesRef.current[active];

      if (desiredFrame !== activeFrame) {
        if (
          requestedFramesRef.current[inactive] !== desiredFrame &&
          now >= transitionLockedUntilRef.current
        ) {
          loadFrame(inactive, desiredFrame);
        } else if (
          readyFramesRef.current[inactive] === desiredFrame &&
          now >= readyAtRef.current[inactive] &&
          now >= transitionLockedUntilRef.current
        ) {
          activeLayerRef.current = inactive;
          transitionLockedUntilRef.current = now + CROSSFADE_MS;
          setActiveLayer(inactive);
          setSvError("");
        }
      } else if (now >= transitionLockedUntilRef.current) {
        const predictedFrame = Math.min(
          Math.floor(rawFrame + Math.max(1, playbackRateRef.current)),
          denseWaypoints.length - 1,
        );
        if (predictedFrame !== activeFrame) {
          loadFrame(inactive, predictedFrame);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [denseWaypoints, initialized, isPlaying]);

  const errorMessage = svError || (loadError ? `Google Maps error: ${loadError.message}` : "");

  if (!visible) return null;

  const layerStyle = (layer: LayerIndex): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    opacity: activeLayer === layer ? 1 : 0,
    zIndex: activeLayer === layer ? 2 : 1,
    pointerEvents: activeLayer === layer ? "auto" : "none",
    transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
    background: "#000",
  });

  return (
    <div style={{
      width: "100%",
      height: "100%",
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      background: "#000",
    }}>
      <div ref={layer0Ref} style={layerStyle(0)} />
      <div ref={layer1Ref} style={layerStyle(1)} />

      {!hasKey && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 5, display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "#fbbf24", fontSize: 14, padding: 20, textAlign: "center",
          background: "#000",
        }}>
          Google API key required - add it in Settings to use Live Street View
        </div>
      )}
      {hasKey && !mapsReady && !errorMessage && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 5, display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,0.6)", fontSize: 14,
          background: "#000",
        }}>
          Loading Street View...
        </div>
      )}
      {errorMessage && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 5, display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "#f87171", fontSize: 14, padding: 20, textAlign: "center",
          background: "rgba(0,0,0,0.82)",
        }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}

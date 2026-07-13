import { useEffect, useState, useRef, useCallback } from "react";
import {
  GoogleMap,
  Marker as GmapsMarker,
} from "@react-google-maps/api";
import { useAppState } from "../context/AppContext";
import { useTheme } from "../context/ThemeContext";
import { useGoogleMapsLoader } from "../hooks/useGoogleMapsLoader";
import { saveRouteDraft, getAllRouteDrafts, deleteRouteDraft } from "../services/db";
import {
  generateRouteVideo,
  fetchRouteLibrary,
  deleteRouteVideo,
  subscribeRouteProgress,
  checkRouteCoverage,
  regenerateRouteVideo,
  saveLiveRoute,
  type RouteProgressState,
} from "../services/api";
import type { Waypoint, RouteDraft, RouteVideoMeta, LibraryVideo, CoverageResult } from "../types";

// ── Google Maps container style ────────────────────────

const mapContainerStyle = { width: "100%", height: "100%" };
const defaultCenter = { lat: 45.0, lng: 9.0 };

// Marker SVGs rendered via google.maps.SymbolPath / custom icon
const START_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="#22c55e" stroke="white" stroke-width="3"/><text x="14" y="19" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="sans-serif">S</text></svg>'
)}`;
const END_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="#ef4444" stroke="white" stroke-width="3"/><text x="14" y="19" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="sans-serif">E</text></svg>'
)}`;
const DOT_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#4f46e5" stroke="white" stroke-width="2"/></svg>'
)}`;

// ── Helpers ───────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function totalDistanceKm(waypoints: Waypoint[]): number {
  if (waypoints.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < waypoints.length; i++) {
    d += haversine(
      waypoints[i - 1].lat,
      waypoints[i - 1].lng,
      waypoints[i].lat,
      waypoints[i].lng
    );
  }
  return d;
}

// ── Map sub-components ─────────────────────────────────

// ── Main component ────────────────────────────────────

type Mode = "manual" | "auto";

type GenerationState =
  | { phase: "idle" }
  | { phase: "generating"; genId: string; percent: number; status: string };

/** Whether the route should be pre-rendered as static MP4 or streamed live via panorama */
type VideoMode = "static" | "live";

  // Module-level state to persist generation progress across tab switches
  let activeGenId: string | null = null;
  let activeGenName: string | null = null;

  export default function RouteCreatorPage() {
  const { googleApiKey, setLibrary, library, setRouteVideos, setActivePage } = useAppState();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [mode, setMode] = useState<Mode>("manual");
  const [videoMode, setVideoMode] = useState<VideoMode>("static");
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [routeName, setRouteName] = useState("");
  const [description, setDescription] = useState("");
    const [mapTypeId, setMapTypeId] = useState<string>("roadmap");
    const [selectedWpIndex, setSelectedWpIndex] = useState<number | null>(null);

  // Auto-routing
  const [startAddress, setStartAddress] = useState("");
  const [endAddress, setEndAddress] = useState("");
  const [autoRouting, setAutoRouting] = useState(false);
  const [autoRouteError, setAutoRouteError] = useState("");
    const [travelMode, setTravelMode] = useState<string>("WALKING");
  const [frameSpacing, setFrameSpacing] = useState(10);  // meters between frames
    const [imageQuality, setImageQuality] = useState("high");  // Street View image resolution
    const [coverageChecking, setCoverageChecking] = useState(false);
    const [coverageResult, setCoverageResult] = useState<CoverageResult | null>(null);
    const [showRegenDialog, setShowRegenDialog] = useState(false);
    const [regenTarget, setRegenTarget] = useState<RouteVideoMeta | null>(null);

  // Saved drafts & generated videos
  const [drafts, setDrafts] = useState<RouteDraft[]>([]);
  const [localRouteVideos, setLocalRouteVideos] = useState<RouteVideoMeta[]>([]);

  // Generation state
  const [genState, setGenState] = useState<GenerationState>(() =>
    activeGenId
      ? { phase: "generating", genId: activeGenId, percent: 0, status: "resuming…" }
      : { phase: "idle" }
  );

  // Toast
  const [toast, setToast] = useState("");

  const mapRef = useRef<google.maps.Map | null>(null);
  const waypointsRef = useRef<Waypoint[]>([]);
  // Keep ref in sync
  waypointsRef.current = waypoints;
    const shouldFitBounds = useRef(false);
      const polylineRef = useRef<google.maps.Polyline | null>(null);
      const wpListRef = useRef<HTMLDivElement | null>(null);
      const wpItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

      // Keep polyline in sync with waypoints using native Maps API
      useEffect(() => {
        const map = mapRef.current;
        if (!map || waypoints.length < 2) {
          if (polylineRef.current) {
            polylineRef.current.setMap(null);
            polylineRef.current = null;
          }
          return;
        }
        if (!polylineRef.current) {
          polylineRef.current = new google.maps.Polyline({
            map,
            path: waypoints,
            strokeColor: "#4f46e5",
            strokeWeight: 4,
            strokeOpacity: 0.8,
          });
        } else {
          polylineRef.current.setPath(waypoints);
          polylineRef.current.setMap(map);
        }
        return () => {
          // Cleanup on unmount
          if (polylineRef.current) {
            polylineRef.current.setMap(null);
            polylineRef.current = null;
          }
        };
      }, [waypoints]);

      // Autoscroll waypoint list when selectedWpIndex changes
      useEffect(() => {
        if (selectedWpIndex !== null) {
          const el = wpItemRefs.current.get(selectedWpIndex);
          if (el) {
            el.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }
      }, [selectedWpIndex]);

        // Fit bounds only on explicit request (e.g., after auto-route)
        useEffect(() => {
          const map = mapRef.current;
          if (map && waypoints.length >= 2 && shouldFitBounds.current) {
            const bounds = new google.maps.LatLngBounds();
            waypoints.forEach((w) => bounds.extend(w));
            map.fitBounds(bounds, 50);
            shouldFitBounds.current = false;
          }
        }, [waypoints]);

  const dist = totalDistanceKm(waypoints);
  const frameEstimate = Math.max(1, Math.round(dist * 100)); // ~10m spacing → 100 frames/km
  const costEstimate = (frameEstimate * 0.007).toFixed(2); // $7/1000

  // ── Google Maps JS loader ─────────────────────────────
  const { isLoaded: gmLoaded } = useGoogleMapsLoader(googleApiKey);

  // ── Load saved data ──────────────────────────────────
  useEffect(() => {
    getAllRouteDrafts().then(setDrafts);
    fetchRouteLibrary()
      .then((v) => setLocalRouteVideos(v))
      .catch(() => {});
  }, []);

  // ── SSE progress ─────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeRouteProgress((state: RouteProgressState) => {
      // state keys are genIds; find ours
      if (genState.phase !== "generating") return;
      const entry = state[genState.genId];

      if (entry) {
        if (entry.status === "completed" || entry.status === "failed") {
                  activeGenId = null;
                  activeGenName = null;
                  setGenState({ phase: "idle" });
          if (entry.status === "completed") {
            setToast(`✅ "${entry.name}" generated!`);
            // Refresh libraries
            fetchRouteLibrary().then(setLocalRouteVideos).catch(() => {});
          } else {
            setToast(`❌ Generation failed: ${entry.error || "Unknown error"}`);
          }
        } else {
          setGenState({
            phase: "generating",
            genId: genState.genId,
            percent: entry.percent,
            status: entry.status,
          });
        }
      } else {
        // If entry is missing and we’re looking for it, the generation might already
        // be done (SSE could have disconnected before we saw "completed").
        // Poll routes to confirm.
        const check = setTimeout(() => {
          fetchRouteLibrary().then((v) => {
            setLocalRouteVideos(v);
            setGenState({ phase: "idle" });
          }).catch(() => {});
        }, 3000);
        return () => clearTimeout(check);
      }
    });
    return unsub;
  }, [genState.phase === "generating" ? genState.genId : null]);

  // ── Manual map clicks ────────────────────────────────
  const handleMapClick = useCallback(
      (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        setWaypoints((prev) => [...prev, { lat: e.latLng!.lat(), lng: e.latLng!.lng() }]);
        setSelectedWpIndex(null);
      },
      []
    );

    // Handle marker drag end: reroute segment via Google Directions
    const handleMarkerDragEnd = useCallback(
      async (index: number, newPos: google.maps.LatLng) => {
        const newLatLng: Waypoint = { lat: newPos.lat(), lng: newPos.lng() };
            const prevWps = waypointsRef.current;

            // Update the dragged waypoint immediately
            setWaypoints((prev) => {
              const next = [...prev];
              next[index] = newLatLng;
              return next;
            });

            // If we have a Google API key and at least 3 waypoints (so there's a segment), reroute
            if (!googleApiKey || prevWps.length < 3) return;

            const prevIdx = index - 1;
            const nextIdx = index + 1;

            // Only reroute if dragging an intermediate point with neighbors on both sides
            if (prevIdx < 0 || nextIdx >= prevWps.length) return;

            try {
              const ds = new google.maps.DirectionsService();
              const dirRes = await ds.route({
                origin: prevWps[prevIdx],
                destination: prevWps[nextIdx],
                              travelMode: travelMode as google.maps.TravelMode,
              });

              const route = dirRes?.routes?.[0];
              if (!route || !route.overview_path || route.overview_path.length < 2) return;

              // Build the intermediate points from the rerouted segment
              const segmentPath: Waypoint[] = route.overview_path.map((p) => ({
                lat: p.lat(),
                lng: p.lng(),
              }));

              // Sample ~50m spacing
              const sampled: Waypoint[] = [segmentPath[0]];
              let lastAdded = segmentPath[0];
              for (let s = 1; s < segmentPath.length; s++) {
                const d = haversine(
                  lastAdded.lat,
                  lastAdded.lng,
                  segmentPath[s].lat,
                  segmentPath[s].lng
                );
                if (d >= 0.05 || s === segmentPath.length - 1) {
                  sampled.push(segmentPath[s]);
                  lastAdded = segmentPath[s];
                }
              }

              // Replace the segment: keep [0..prevIdx], insert sampled, keep [nextIdx+1..]
              // sampled[0] ≈ prevWps[prevIdx], sampled[last] ≈ prevWps[nextIdx]
              // so we skip the first/last of sampled to avoid duplicating those anchors
              const middle = sampled.slice(1, -1);
              if (middle.length === 0) return;

              setWaypoints((prev) => {
                const before = prev.slice(0, prevIdx + 1); // up to and including prevIdx neighbor
                const after = prev.slice(nextIdx); // from nextIdx neighbor onward
                return [...before, ...middle, ...after];
              });
            } catch {
              // Silently fail — the dragged point is already updated above
            }
          },
          [googleApiKey, travelMode]
        );

    const undoWaypoint = () => {
      setWaypoints((p) => p.slice(0, -1));
      setSelectedWpIndex(null);
    };
    const clearWaypoints = () => {
      setWaypoints([]);
      setSelectedWpIndex(null);
    };

  // ── Auto-routing via Google Directions ───────────────
  const handleAutoRoute = async () => {
    if (!googleApiKey) {
      setAutoRouteError("Please set your Google API key in Settings first.");
      return;
    }
    if (!startAddress.trim() || !endAddress.trim()) {
      setAutoRouteError("Please enter both start and end addresses.");
      return;
    }
    setAutoRouting(true);
    setAutoRouteError("");

    try {
      // Geocode both addresses
        const geocoder = new google.maps.Geocoder();
      const [startRes, endRes] = await Promise.all([
        geocoder.geocode({ address: startAddress }),
        geocoder.geocode({ address: endAddress }),
      ]);

      if (!startRes.results[0] || !endRes.results[0]) {
        throw new Error("Could not find one or both addresses.");
      }

      const startLoc = startRes.results[0].geometry.location;
      const endLoc = endRes.results[0].geometry.location;

      // Request directions
      const ds = new google.maps.DirectionsService();
      const dirRes = await ds.route({
        origin: startLoc,
        destination: endLoc,
              travelMode: travelMode as google.maps.TravelMode,
      });

      const route = dirRes.routes[0];
      if (!route) throw new Error("No route found.");

      // Extract polyline and simplify to ~50m waypoints
        const overview: Waypoint[] = route.overview_path.map((p) => ({
        lat: p.lat(),
        lng: p.lng(),
      }));

      // Sample every ~50m
      const sampled: Waypoint[] = [overview[0]];
      let lastAdded = overview[0];
      for (let i = 1; i < overview.length; i++) {
        const d = haversine(lastAdded.lat, lastAdded.lng, overview[i].lat, overview[i].lng);
        if (d >= 0.05 || i === overview.length - 1) {
          sampled.push(overview[i]);
          lastAdded = overview[i];
        }
      }

      setWaypoints(sampled);
      setSelectedWpIndex(null);
            shouldFitBounds.current = true;
      const leg = route.legs[0];
      setRouteName(
        routeName || `${leg?.start_address?.split(",")[0] ?? "Start"} → ${leg?.end_address?.split(",")[0] ?? "End"}`
      );
      setToast(`✅ Route found: ${leg?.distance?.text ?? ""}`);
    } catch (err: any) {
      setAutoRouteError(err.message || "Auto-routing failed.");
    } finally {
      setAutoRouting(false);
    }
  };

  // ── Save draft ───────────────────────────────────────
  const handleSaveDraft = async () => {
    if (waypoints.length < 2) return;
    const draft: RouteDraft = {
      id: Date.now().toString(),
      name: routeName.trim() || `Route ${new Date().toLocaleDateString()}`,
      description: description.trim(),
      waypoints,
      createdAt: Date.now(),
    };
    await saveRouteDraft(draft);
    setDrafts(await getAllRouteDrafts());
    setToast("✅ Draft saved!");
  };

  const handleLoadDraft = (draft: RouteDraft) => {
    setWaypoints(draft.waypoints);
    setRouteName(draft.name);
    setDescription(draft.description);
  };

  const handleDeleteDraft = async (id: string) => {
    await deleteRouteDraft(id);
    setDrafts(await getAllRouteDrafts());
  };

  // ── Generate video ───────────────────────────────────
  const handleGenerate = async () => {
    if (!googleApiKey) {
      setToast("❌ Please set your Google API key in Settings first.");
      return;
    }
    if (waypoints.length < 2) {
      setToast("❌ Please define a route with at least 2 waypoints.");
      return;
    }
    if (!routeName.trim()) {
      setToast("❌ Please give the route a name.");
      return;
    }

      // Run coverage check first
      if (!coverageResult || coverageResult.uncovered.length > 0) {
        await handleCheckCoverage();
        return;
      }

      try {
        const { generation_id } = await generateRouteVideo({
          waypoints,
          route_name: routeName.trim(),
          description: description.trim(),
          api_key: googleApiKey,
          spacing_m: frameSpacing,
          quality: imageQuality,
        });
        activeGenId = generation_id;
        activeGenName = routeName.trim();
        setGenState({ phase: "generating", genId: generation_id, percent: 0, status: "starting" });
        setToast("🎬 Generation started...");
        setCoverageResult(null); // Clear coverage result after starting generation
      } catch (err: any) {
        setToast(`❌ ${err.message || "Generation failed"}`);
      }
    };

    const handleCheckCoverage = async () => {
      if (!googleApiKey || waypoints.length < 2) return;
      setCoverageChecking(true);
      setCoverageResult(null);
      try {
        const result = await checkRouteCoverage({
          waypoints,
          api_key: googleApiKey,
        });
        setCoverageResult(result);
        if (result.uncovered.length > 0) {
          setToast(`⚠️ ${result.uncovered.length} of ${result.total} checkpoints lack Street View coverage.`);
        } else {
          setToast(`✅ All ${result.total} checkpoints have Street View coverage!`);
        }
      } catch (err: any) {
        setToast(`❌ Coverage check failed: ${err.message || "Unknown error"}`);
      } finally {
        setCoverageChecking(false);
      }
    };

    const handleRegenerate = async () => {
      if (!regenTarget?.cache_id || !googleApiKey) return;
      try {
        const { generation_id } = await regenerateRouteVideo({
          waypoints: regenTarget.waypoints || [],
          route_name: regenTarget.name,
          description: regenTarget.description || "",
          api_key: googleApiKey,
          spacing_m: frameSpacing,
          quality: imageQuality,
          cached_route_id: regenTarget.cache_id,
        });
        activeGenId = generation_id;
        activeGenName = regenTarget.name;
        setGenState({ phase: "generating", genId: generation_id, percent: 0, status: "starting" });
        setToast("🎬 Regeneration started...");
        setShowRegenDialog(false);
        setRegenTarget(null);
      } catch (err: any) {
        setToast(`❌ ${err.message || "Regeneration failed"}`);
      }
    };

  const handleDeleteGenerated = async (id: string) => {
    try {
      await deleteRouteVideo(id);
      setLocalRouteVideos(await fetchRouteLibrary());
      setToast("🗑 Route video deleted.");
    } catch {
      setToast("❌ Failed to delete.");
    }
  };

  const handlePlayVideo = (video: RouteVideoMeta) => {
      // Add as a streetview library item and switch to training page
      const libItem: LibraryVideo = {
        id: video.id,
        title: video.name,
        filename: video.filename,
        duration: video.duration_s,
        thumbnail: null,
        quality: "auto",
        fileSize: video.file_size,
        downloadedAt: video.generated_at,
        youtubeUrl: "",
        source: "streetview" as const,
        waypoints: video.waypoints,
        distanceKm: video.distance_km,
        description: video.description,
          mode: video.mode || "static",
          denseWaypoints: video.dense_waypoints,
        };
        setLibrary([...library, libItem]);
        setRouteVideos([...localRouteVideos, video]);
        setActivePage("training");
      };

    const handleSaveLiveRoute = async () => {
      if (waypoints.length < 2 || !routeName.trim()) return;
      try {
        const result = await saveLiveRoute({
          waypoints,
          route_name: routeName.trim(),
          description: description.trim(),
        });
        // Add as a live library item
        const libItem: LibraryVideo = {
          id: result.id,
          title: routeName.trim(),
          filename: "", // No MP4 file
          duration: result.duration_s,
          thumbnail: null,
          quality: "streetview",
          fileSize: 0,
          downloadedAt: Date.now(),
          youtubeUrl: "",
          source: "streetview" as const,
          waypoints,
          distanceKm: result.distance_km,
          description: description.trim(),
          mode: "live",
          denseWaypoints: result.dense_waypoints,
        };
        setLibrary([...library, libItem]);
        // Refresh route library
        fetchRouteLibrary().then(setLocalRouteVideos).catch(() => {});
        setToast("✅ Live route saved! Switch to Training to ride.");
        setActivePage("training");
      } catch (err: any) {
        setToast(`❌ ${err.message || "Failed to save live route"}`);
      }
    };

  // ── Auto-clear toast ─────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Styles ───────────────────────────────────────────
  const inputStyle = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--glass-border)",
    background: isDark ? "#1e1e1e" : "#fff",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  const btnPrimary = {
    padding: "10px 18px",
    borderRadius: "var(--radius-md)",
    border: "none",
    background: "var(--accent-gradient)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600 as const,
    transition: "all var(--transition-fast)",
  };

  const btnSecondary = {
    padding: "8px 14px",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--glass-border)",
    background: isDark ? "#2a2a2a" : "#f0f0f0",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 12,
    transition: "all var(--transition-fast)",
  };

  const isGenerating = genState.phase === "generating";

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 62px)",
        overflow: "hidden",
      }}
    >
      {/* ── Sidebar ────────────────────────────────── */}
      <aside
        style={{
          width: 360,
          minWidth: 360,
          padding: "16px",
          background: isDark ? "#111" : "#fafafa",
          borderRight: "1px solid var(--glass-border)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setMode("manual")}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: "var(--radius-md)",
              border: mode === "manual" ? "2px solid var(--accent-light)" : "1px solid var(--glass-border)",
              background: mode === "manual" ? "var(--accent-bg)" : "transparent",
              color: mode === "manual" ? "var(--accent-light)" : "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ✏️ Manual
          </button>
          <button
            onClick={() => setMode("auto")}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: "var(--radius-md)",
              border: mode === "auto" ? "2px solid var(--accent-light)" : "1px solid var(--glass-border)",
              background: mode === "auto" ? "var(--accent-bg)" : "transparent",
              color: mode === "auto" ? "var(--accent-light)" : "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            🧭 Auto-Route
          </button>
        </div>

                {/* Video mode toggle */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setVideoMode("static")}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      borderRadius: "var(--radius-md)",
                      border: videoMode === "static" ? "2px solid #8b5cf6" : "1px solid var(--glass-border)",
                      background: videoMode === "static" ? "rgba(139,92,246,0.1)" : "transparent",
                      color: videoMode === "static" ? "#a78bfa" : "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    📼 Static Video (MP4)
                  </button>
                  <button
                    onClick={() => setVideoMode("live")}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      borderRadius: "var(--radius-md)",
                      border: videoMode === "live" ? "2px solid #06b6d4" : "1px solid var(--glass-border)",
                      background: videoMode === "live" ? "rgba(6,182,212,0.1)" : "transparent",
                      color: videoMode === "live" ? "#22d3ee" : "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    🌐 Live Panorama
                  </button>
                </div>

        {/* Manual mode controls */}
        {mode === "manual" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
              Click on the map to add waypoints. Drag to pan, scroll to zoom.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={undoWaypoint} disabled={waypoints.length === 0} style={btnSecondary}>
                ↩ Undo
              </button>
              <button onClick={clearWaypoints} disabled={waypoints.length === 0} style={btnSecondary}>
                ✕ Clear All
              </button>
            </div>
          </div>
        )}

        {/* Auto-routing controls */}
        {mode === "auto" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text"
              value={startAddress}
              onChange={(e) => setStartAddress(e.target.value)}
              placeholder="Start address…"
              style={inputStyle}
            />
            <input
              type="text"
              value={endAddress}
              onChange={(e) => setEndAddress(e.target.value)}
              placeholder="End address…"
              style={inputStyle}
            />
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            Route via:
                          </span>
                          <select
                            value={travelMode}
                            onChange={(e) => setTravelMode(e.target.value)}
                            style={{
                              ...inputStyle,
                              flex: 1,
                              padding: "4px 6px",
                              cursor: "pointer",
                            }}
                          >
                            <option value="WALKING">🚶 Walking (bike-friendly)</option>
                            <option value="BICYCLING">🚲 Bicycling</option>
                            <option value="DRIVING">🚗 Driving</option>
                          </select>
                        </div>
                        <button
              onClick={handleAutoRoute}
              disabled={autoRouting || !googleApiKey}
              style={{
                ...btnPrimary,
                opacity: autoRouting ? 0.6 : 1,
                            ...(googleApiKey ? {} : { background: "#555" }),
              }}
            >
              {autoRouting ? "⏳ Routing…" : "🔍 Find Route"}
            </button>
            {autoRouteError && (
              <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{autoRouteError}</p>
            )}
            {!googleApiKey && (
              <p style={{ color: "#f59e0b", fontSize: 11, margin: 0 }}>
                ⚠ Google API key required — set in Settings
              </p>
            )}
                        {waypoints.length >= 2 && (
                          <p style={{ color: "var(--accent-light)", fontSize: 11, margin: 0 }}>
                            💡 Switch to ✏️ Manual mode to tweak waypoints on the map
                          </p>
                        )}
                      </div>
        )}

        {/* Route info */}
        <div
          style={{
            padding: "12px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--glass-border)",
            background: isDark ? "#1a1a1a" : "#f5f5f5",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span>Waypoints:</span>
            <strong style={{ color: "var(--text-primary)" }}>{waypoints.length}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span>Distance:</span>
            <strong style={{ color: "var(--text-primary)" }}>{dist.toFixed(2)} km</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span>Est. frames (~10m):</span>
            <strong style={{ color: "var(--text-primary)" }}>{frameEstimate}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Est. cost:</span>
            <strong style={{ color: "var(--accent-light)" }}>~${costEstimate}</strong>
          </div>
        </div>

                {/* Waypoint list editor */}
                {waypoints.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        📍 Waypoints ({waypoints.length})
                      </span>
                      <button
                        onClick={clearWaypoints}
                        style={{
                          ...btnSecondary,
                          padding: "2px 8px",
                          fontSize: 10,
                        }}
                      >
                        Clear all
                      </button>
                    </div>
                    <div
                                          ref={wpListRef}
                                          style={{
                                            maxHeight: 150,
                                            overflowY: "auto",
                                            borderRadius: "var(--radius-md)",
                                            border: "1px solid var(--glass-border)",
                                            background: isDark ? "#111" : "#fafafa",
                                          }}
                                        >
                                          {waypoints.map((wp, i) => {
                                            const label =
                                                              i === 0 ? "🏁 Start" : i === waypoints.length - 1 ? "🏁 End" : `📍 Pt ${i + 1}`;
                                                            const isSelected = selectedWpIndex === i;
                                                            return (
                                                              <div
                                                                key={i}
                                                                ref={(el) => {
                                                                  if (el) wpItemRefs.current.set(i, el);
                                                                  else wpItemRefs.current.delete(i);
                                                                }}
                                                                onClick={() => {
                                                                  setSelectedWpIndex(i);
                                                                  // Pan map to this waypoint
                                                                  if (mapRef.current) {
                                                                    mapRef.current.panTo(wp);
                                                                  }
                                                                }}
                                            style={{
                                              display: "flex",
                                              justifyContent: "space-between",
                                              alignItems: "center",
                                              padding: "4px 8px",
                                              borderBottom:
                                                i < waypoints.length - 1 ? "1px solid var(--glass-border)" : "none",
                                              fontSize: 11,
                                              color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                                              background: isSelected
                                                ? isDark
                                                  ? "#222"
                                                  : "#e8e8ff"
                                                : "transparent",
                                              cursor: "pointer",
                                              transition: "background 0.15s",
                                            }}
                                          >
                                            <span>
                                              <span style={{ fontWeight: 600, color: isSelected ? "#4f46e5" : "var(--text-primary)" }}>
                                                {label}
                                              </span>
                                              {" · "}
                                              {wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}
                                            </span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setWaypoints((prev) => prev.filter((_, idx) => idx !== i));
                                                if (selectedWpIndex === i) setSelectedWpIndex(null);
                                              }}
                                              style={{
                                                background: "none",
                                                border: "none",
                                                color: "#ef4444",
                                                cursor: "pointer",
                                                fontSize: 14,
                                                padding: "0 4px",
                                              }}
                                              title="Remove waypoint"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                )}

                {/* Route name & description */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            type="text"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="Route name…"
            style={inputStyle}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)…"
            rows={2}
            style={{ ...inputStyle, resize: "vertical", minHeight: 40 }}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {isGenerating ? (
            <div
              style={{
                padding: "10px",
                borderRadius: "var(--radius-md)",
                background: "var(--accent-bg)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                <span>🎬 {genState.status}</span>
                <span>{genState.percent}%</span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 6,
                  borderRadius: 999,
                  background: isDark ? "#333" : "#ddd",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${genState.percent}%`,
                    height: "100%",
                    background: "var(--accent-gradient)",
                    transition: "width 0.3s ease",
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          ) : (
            <>
                        {videoMode === "static" ? (
                          <>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                Spacing:
                              </span>
                              <select
                                value={frameSpacing}
                                onChange={(e) => setFrameSpacing(Number(e.target.value))}
                                style={{
                                  ...inputStyle,
                                  flex: 1,
                                  padding: "4px 6px",
                                  cursor: "pointer",
                                }}
                              >
                                <option value={5}>5 m (smoother, more data)</option>
                                <option value={10}>10 m (default)</option>
                                <option value={15}>15 m</option>
                                <option value={20}>20 m</option>
                                <option value={30}>30 m (faster, less data)</option>
                              </select>
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                Quality:
                              </span>
                              <select
                                value={imageQuality}
                                onChange={(e) => setImageQuality(e.target.value)}
                                style={{
                                  ...inputStyle,
                                  flex: 1,
                                  padding: "4px 6px",
                                  cursor: "pointer",
                                }}
                              >
                                <option value="high">1920×1080 (HD, higher API cost)</option>
                                <option value="medium">1280×720 (balanced)</option>
                                <option value="low">640×400 (fast, lower cost)</option>
                              </select>
                            </div>
                            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                              Est. frames: ~{Math.round(dist * 1000 / (frameSpacing || 1))}  ·  Est. data: ~{Math.round(dist * 1000 / (frameSpacing || 1) * 0.15)} MB
                            </div>

                            {/* Coverage check */}
                            <button
                              onClick={handleCheckCoverage}
                              disabled={coverageChecking || waypoints.length < 2 || !googleApiKey}
                              style={{
                                ...btnSecondary,
                                opacity: coverageChecking || waypoints.length < 2 || !googleApiKey ? 0.5 : 1,
                                fontSize: 12,
                                padding: "8px 12px",
                              }}
                            >
                              {coverageChecking ? "🔍 Checking…" : "🔍 Check Street View Coverage"}
                            </button>
                            {coverageResult && (
                              <div
                                style={{
                                  fontSize: 11,
                                  padding: "6px 8px",
                                  borderRadius: "var(--radius-sm)",
                                  background: coverageResult.uncovered.length > 0
                                    ? isDark ? "#422" : "#fee2e2"
                                    : isDark ? "#242" : "#dcfce7",
                                  color: coverageResult.uncovered.length > 0
                                    ? isDark ? "#fca5a5" : "#991b1b"
                                    : isDark ? "#86efac" : "#166534",
                                }}
                              >
                                {coverageResult.uncovered.length > 0
                                  ? `⚠️ ${coverageResult.uncovered.length} of ${coverageResult.total} checkpoints lack Street View coverage. You may still try generating.`
                                  : `✅ All ${coverageResult.total} checkpoints have coverage!`}
                              </div>
                            )}

                            <button
                              onClick={handleGenerate}
                              disabled={waypoints.length < 2 || !routeName.trim() || !googleApiKey}
                              style={{
                                ...btnPrimary,
                                opacity: waypoints.length < 2 || !routeName.trim() || !googleApiKey ? 0.5 : 1,
                              }}
                            >
                              🎬 Generate Street View Video
                            </button>
                          </>
                        ) : (
                          /* Live panorama mode — simple save */
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
                              🌐 Live mode streams Google Street View panorama in real-time during training.
                              No pre-rendering needed — requires internet connection during your ride.
                            </p>
                            <button
                              onClick={handleSaveLiveRoute}
                              disabled={waypoints.length < 2 || !routeName.trim()}
                              style={{
                                ...btnPrimary,
                                background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                                opacity: waypoints.length < 2 || !routeName.trim() ? 0.5 : 1,
                              }}
                            >
                              🌐 Save Live Route
                            </button>
                          </div>
                        )}
              <button
                onClick={handleSaveDraft}
                disabled={waypoints.length < 2}
                style={{
                  ...btnSecondary,
                  opacity: waypoints.length < 2 ? 0.5 : 1,
                  padding: "10px 14px",
                  fontSize: 13,
                }}
              >
                💾 Save Draft
              </button>
            </>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--glass-border)" }} />

        {/* Saved drafts */}
        {drafts.length > 0 && (
          <>
            <h3 style={{ fontSize: 14, margin: 0, color: "var(--text-primary)" }}>
              📋 Saved Drafts
            </h3>
            {drafts.map((d) => (
              <div
                key={d.id}
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--glass-border)",
                  fontSize: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {d.name}
                  </div>
                  <div style={{ color: "var(--text-secondary)" }}>
                    {d.waypoints.length} pts · {totalDistanceKm(d.waypoints).toFixed(1)} km
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => handleLoadDraft(d)}
                    style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11 }}
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDeleteDraft(d.id)}
                    style={{
                      ...btnSecondary,
                      padding: "4px 8px",
                      fontSize: 11,
                      color: "#ef4444",
                      borderColor: "#ef4444",
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Generated videos */}
        {localRouteVideos.length > 0 && (
          <>
            <h3 style={{ fontSize: 14, margin: 0, color: "var(--text-primary)" }}>
              🎬 Generated Videos
            </h3>
                    {localRouteVideos.map((v) => (
              <div
                key={v.id}
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--glass-border)",
                  fontSize: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {v.name}
                  </div>
                  <div style={{ color: "var(--text-secondary)" }}>
                    {v.distance_km.toFixed(1)} km · {v.duration_s}s
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => handlePlayVideo(v)}
                    style={{
                      ...btnSecondary,
                      padding: "4px 8px",
                      fontSize: 11,
                      color: "var(--accent-light)",
                      borderColor: "var(--accent-light)",
                    }}
                  >
                    ▶ Train
                  </button>
                                  {v.cache_id && (
                                    <button
                                      onClick={() => {
                                        setRegenTarget(v);
                                        setShowRegenDialog(true);
                                      }}
                                      style={{
                                        ...btnSecondary,
                                        padding: "4px 8px",
                                        fontSize: 11,
                                        color: "#8b5cf6",
                                        borderColor: "#8b5cf6",
                                      }}
                                    >
                                      🔄 Regen
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteGenerated(v.id)}
                                    style={{
                                      ...btnSecondary,
                                      padding: "4px 8px",
                                      fontSize: 11,
                                      color: "#ef4444",
                                      borderColor: "#ef4444",
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
              </div>
            ))}
          </>
        )}
      </aside>

      {/* ── Map ─────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative" }}>
              {!googleApiKey ? (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-secondary)",
                    fontSize: 14,
                    background: isDark ? "#1a1a1a" : "#f0f0f0",
                  }}
                >
                  ⚠ Set your Google API key in Settings to enable maps
                </div>
              ) : !gmLoaded ? (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-secondary)",
                    fontSize: 14,
                    background: isDark ? "#1a1a1a" : "#f0f0f0",
                  }}
                >
                  Loading map…
                </div>
              ) : (
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={defaultCenter}
                  zoom={6}
                  options={{
                    mapTypeId,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    clickableIcons: false,
                  }}
                  onClick={mode === "manual" && !isGenerating ? handleMapClick : undefined}
                  onLoad={(map) => {
                    mapRef.current = map;
                  }}
                >
                  {/* Draggable, numbered waypoint markers */}
                                    {waypoints.map((wp, i) => {
                                      const isStart = i === 0;
                                      const isEnd = i === waypoints.length - 1;
                                      const iconUrl =
                                        isStart ? START_SVG : isEnd ? END_SVG : DOT_SVG;
                                      const iconSize = isStart || isEnd ? 28 : 18;
                                      const isSelected = selectedWpIndex === i;

                                      return (
                                        <GmapsMarker
                                          key={`wp-${i}`}
                                          position={wp}
                                          draggable={mode === "manual" || (mode === "auto" && i > 0 && i < waypoints.length - 1)}
                                          onClick={() => setSelectedWpIndex(i)}
                                          onDragEnd={(e) => {
                                            if (!e.latLng) return;
                                            handleMarkerDragEnd(i, e.latLng);
                                          }}
                                          icon={{
                                            url: iconUrl,
                                            scaledSize: isSelected
                                              ? new google.maps.Size(iconSize + 6, iconSize + 6)
                                              : new google.maps.Size(iconSize, iconSize),
                                          }}
                                          label={
                                            isStart || isEnd
                                              ? undefined
                                              : {
                                                  text: String(i + 1),
                                                  color: "white",
                                                  fontSize: "10px",
                                                  fontWeight: "bold",
                                                }
                                          }
                                        />
                                      );
                                    })}
                                  </GoogleMap>
              )}

              {/* Layer selector */}
              {gmLoaded && googleApiKey && (
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    display: "flex",
                    gap: 4,
                    zIndex: 1000,
                  }}
                >
                  {(
                    [
                                        ["roadmap", "🗺"],
                                        ["satellite", "🛰"],
                                        ["hybrid", "📍"],
                                        ["terrain", "⛰"],
                                      ] as [string, string][]
                  ).map(([id, emoji]) => (
                    <button
                      key={id}
                      onClick={() => setMapTypeId(id)}
                      title={id}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "var(--radius-md)",
                        border: mapTypeId === id ? "2px solid var(--accent-light)" : "1px solid var(--glass-border)",
                        background: mapTypeId === id ? "var(--accent-bg)" : isDark ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.85)",
                        backdropFilter: "blur(8px)",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Map overlay stats */}
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  padding: "8px 14px",
                  borderRadius: "var(--radius-md)",
                  background: isDark ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.85)",
                  backdropFilter: "blur(8px)",
                  border: "1px solid var(--glass-border)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  zIndex: 1000,
                }}
              >
                <div>
                  <strong style={{ color: "var(--text-primary)" }}>{dist.toFixed(2)}</strong> km
                </div>
                <div>
                  <strong style={{ color: "var(--text-primary)" }}>{waypoints.length}</strong> pts
                </div>
              </div>
            </div>

      {/* ── Toast ───────────────────────────────────── */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 24px",
            borderRadius: "var(--radius-lg)",
            background: isDark ? "#1f2937" : "#fff",
            border: "1px solid var(--glass-border)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            color: "var(--text-primary)",
            fontSize: 14,
            zIndex: 9999,
            backdropFilter: "blur(12px)",
          }}
        >
          {toast}
        </div>
      )}

                {/* Regeneration Dialog */}
                {showRegenDialog && regenTarget && (
                  <div
                    style={{
                      position: "fixed",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(0,0,0,0.6)",
                      zIndex: 10000,
                      backdropFilter: "blur(4px)",
                    }}
                    onClick={() => { setShowRegenDialog(false); setRegenTarget(null); }}
                  >
                    <div
                      style={{
                        background: isDark ? "#1e1e2e" : "#fff",
                        borderRadius: "var(--radius-lg)",
                        padding: "24px",
                        maxWidth: 400,
                        width: "90%",
                        border: "1px solid var(--glass-border)",
                        boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h3 style={{ margin: "0 0 8px", color: "var(--text-primary)", fontSize: 16 }}>
                        🔄 Regenerate Video
                      </h3>
                      <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: 13 }}>
                        Regenerate <strong>{regenTarget.name}</strong> with new settings. Cached Street View images will be reused — no new API costs.
                      </p>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Spacing:</span>
                        <select
                          value={frameSpacing}
                          onChange={(e) => setFrameSpacing(Number(e.target.value))}
                          style={{
                            ...inputStyle,
                            flex: 1,
                            padding: "4px 6px",
                            cursor: "pointer",
                          }}
                        >
                          <option value={5}>5 m</option>
                          <option value={10}>10 m (default)</option>
                          <option value={15}>15 m</option>
                          <option value={20}>20 m</option>
                          <option value={30}>30 m</option>
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Quality:</span>
                        <select
                          value={imageQuality}
                          onChange={(e) => setImageQuality(e.target.value)}
                          style={{
                            ...inputStyle,
                            flex: 1,
                            padding: "4px 6px",
                            cursor: "pointer",
                          }}
                        >
                          <option value="high">1920×1080 (HD)</option>
                          <option value="medium">1280×720 (balanced)</option>
                          <option value="low">640×400 (fast)</option>
                        </select>
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 16 }}>
                        Original: {regenTarget.spacing_m != null ? `${regenTarget.spacing_m} m` : "unknown"}  · {regenTarget.distance_km.toFixed(1)} km  · Cache: {regenTarget.cache_id ? regenTarget.cache_id.slice(0, 8) : "N/A"}
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          onClick={() => { setShowRegenDialog(false); setRegenTarget(null); }}
                          style={{ ...btnSecondary, padding: "8px 16px", fontSize: 13 }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleRegenerate}
                          disabled={!googleApiKey}
                          style={{
                            ...btnPrimary,
                            padding: "8px 16px",
                            fontSize: 13,
                            opacity: !googleApiKey ? 0.5 : 1,
                          }}
                        >
                          🎬 Regenerate
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          }
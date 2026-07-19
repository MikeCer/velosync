import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState } from "../context/AppContext";
import { useGoogleMapsLoader } from "../hooks/useGoogleMapsLoader";
import type { Waypoint } from "../types";

// Haversine distance between two waypoints (km)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

// Interpolate position along the waypoint path given a distance in km
function interpolatePosition(
  waypoints: Waypoint[],
  distanceKm: number,
): { lat: number; lng: number } | null {
  if (waypoints.length < 2) {
    return waypoints.length === 1
      ? { lat: waypoints[0].lat, lng: waypoints[0].lng }
      : null;
  }

  let accumulated = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const segDist = haversineKm(a.lat, a.lng, b.lat, b.lng);
    if (accumulated + segDist >= distanceKm) {
      const frac = segDist > 0 ? (distanceKm - accumulated) / segDist : 0;
      return {
        lat: a.lat + (b.lat - a.lat) * frac,
        lng: a.lng + (b.lng - a.lng) * frac,
      };
    }
    accumulated += segDist;
  }

  // Past the end — return last waypoint
  const last = waypoints[waypoints.length - 1];
  return { lat: last.lat, lng: last.lng };
}

export default function RouteMapOverlay() {
  const {
    googleApiKey,
    playlist,
    currentVideoIndex,
    showMap,
    setShowMap,
    totalDistance,
    routes,
    setRoutes,
    activeRoute,
    setActiveRoute,
  } = useAppState();
  const { isLoaded: mapsReady, loadError } = useGoogleMapsLoader(googleApiKey);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const positionMarkerRef = useRef<google.maps.Marker | null>(null);
  const startMarkerRef = useRef<google.maps.Marker | null>(null);
  const endMarkerRef = useRef<google.maps.Marker | null>(null);
  const initRef = useRef(false);
  const [mapHeight, setMapHeight] = useState(240);
  const [isExpanded, setIsExpanded] = useState(false);

  const currentVideo = playlist[currentVideoIndex];
  const waypoints: Waypoint[] = currentVideo?.waypoints ?? [];
  const isStreetView = currentVideo?.source === "streetview";
  const hasWaypoints = waypoints.length >= 2;

  // Initialize map once Google Maps is loaded
  useEffect(() => {
    if (!showMap || !isStreetView || !mapsReady || !mapContainerRef.current || initRef.current) {
      return;
    }
    if (!hasWaypoints) return;

    const bounds = new google.maps.LatLngBounds();
    waypoints.forEach((wp) => bounds.extend({ lat: wp.lat, lng: wp.lng }));

    const map = new google.maps.Map(mapContainerRef.current, {
      mapId: "velosync-route-map",
      disableDefaultUI: true,
      zoomControl: false,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1d1d2b" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8b8ba7" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1d1d2b" }] },
        { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#a0a0c0" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a3e" }] },
        { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#34344d" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#363652" }] },
        { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#4a4a6a" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#141422" }] },
        { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6a6a8a" }] },
      ],
    });

    map.fitBounds(bounds, { top: 20, right: 20, bottom: 20, left: 20 });

    // Route polyline
    const path = waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng }));
    polylineRef.current = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#6366f1",
      strokeOpacity: 0.85,
      strokeWeight: 4,
      map,
    });

    // Start marker (green dot)
    if (waypoints.length > 0) {
      startMarkerRef.current = new google.maps.Marker({
        position: { lat: waypoints[0].lat, lng: waypoints[0].lng },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: "#22c55e",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        zIndex: 2,
      });
    }

    // End marker (red dot)
    if (waypoints.length > 1) {
      const last = waypoints[waypoints.length - 1];
      endMarkerRef.current = new google.maps.Marker({
        position: { lat: last.lat, lng: last.lng },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: "#ef4444",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        zIndex: 2,
      });
    }

    // Position marker (accent dot — follows session distance)
    positionMarkerRef.current = new google.maps.Marker({
      position: { lat: waypoints[0].lat, lng: waypoints[0].lng },
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#f59e0b",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2.5,
      },
      zIndex: 10,
    });

    mapRef.current = map;
    initRef.current = true;

    return () => {
      // Clean up on unmount
      [polylineRef, positionMarkerRef, startMarkerRef, endMarkerRef].forEach((ref) => {
        ref.current?.setMap(null);
        ref.current = null;
      });
      initRef.current = false;
      mapRef.current = null;
    };
  }, [showMap, isStreetView, mapsReady, waypoints, hasWaypoints]);

  // Update position marker based on total distance traveled
  useEffect(() => {
    if (!positionMarkerRef.current || !hasWaypoints) return;
    const pos = interpolatePosition(waypoints, totalDistance);
    if (pos) {
      positionMarkerRef.current.setPosition({ lat: pos.lat, lng: pos.lng });
    }
  }, [totalDistance, waypoints, hasWaypoints]);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      setMapHeight(prev ? 240 : 420);
      return !prev;
    });
  }, []);

  // Compute total route distance
  const totalRouteDistance =
    waypoints.length >= 2
      ? waypoints.reduce((sum, wp, i) => {
          if (i === 0) return 0;
          return sum + haversineKm(waypoints[i - 1].lat, waypoints[i - 1].lng, wp.lat, wp.lng);
        }, 0)
      : 0;

  // Compute progress
  const progressPercent =
    totalRouteDistance > 0 ? Math.min(100, (totalDistance / totalRouteDistance) * 100) : 0;

  if (!isStreetView || !hasWaypoints) {
    return null;
  }

  // Helper: select a locally-saved route
  const selectRoute = (route: typeof activeRoute) => {
    if (route) {
      setActiveRoute(route);
    }
  };

  // Helper: delete a locally-saved route
  const removeRoute = async (id: string) => {
    const { deleteRoute } = await import("../services/db");
    await deleteRoute(id);
    if (activeRoute?.id === id) setActiveRoute(null);
    const { getAllRoutes } = await import("../services/db");
    setRoutes(await getAllRoutes());
  };

  if (!showMap) {
    return (
      <button
        onClick={() => setShowMap(true)}
        className="glass-card"
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: "var(--radius-lg)",
          border: "1px dashed var(--glass-border)",
          background: "var(--bg-input)",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
          transition: "all var(--transition-fast)",
        }}
      >
        🗺 Show Route Map · {totalRouteDistance.toFixed(1)} km
      </button>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setShowMap(false)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              transition: "color var(--transition-fast)",
            }}
          >
            ✕ Hide Map
          </button>
          {/* Saved route pills */}
          {routes.map((r) => (
            <button
              key={r.id}
              onClick={() => selectRoute(r)}
              onDoubleClick={() => removeRoute(r.id)}
              title="Click to activate · Double-click to delete"
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius-full)",
                border:
                  activeRoute?.id === r.id
                    ? "1px solid var(--accent)"
                    : "1px solid var(--glass-border)",
                background:
                  activeRoute?.id === r.id ? "var(--accent-bg)" : "var(--bg-input)",
                color:
                  activeRoute?.id === r.id ? "var(--accent-light)" : "var(--text-muted)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                transition: "all var(--transition-fast)",
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={toggleExpand}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 14,
              padding: "2px 6px",
            }}
            title={isExpanded ? "Shrink map" : "Expand map"}
          >
            {isExpanded ? "⬆" : "⬇"}
          </button>
        </div>
      </div>

      {/* Map container */}
      <div
        ref={mapContainerRef}
        style={{
          height: mapHeight,
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          border: "1px solid var(--glass-border)",
          background: "#1d1d2b",
          position: "relative",
          transition: "height 300ms ease",
        }}
      />

      {/* Progress bar under the map */}
      <div
        style={{
          marginTop: 8,
          height: 4,
          borderRadius: "var(--radius-full)",
          background: "var(--bg-input)",
          overflow: "hidden",
          border: "1px solid var(--glass-border)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progressPercent}%`,
            background: "var(--accent-gradient)",
            borderRadius: "var(--radius-full)",
            transition: "width 200ms linear",
          }}
        />
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        <span>Route: {totalRouteDistance.toFixed(1)} km</span>
        <span>Traveled: {totalDistance.toFixed(2)} km ({progressPercent.toFixed(0)}%)</span>
      </div>

      {/* Auth / loading / error states */}
      {(loadError || !googleApiKey.trim()) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-primary)",
            borderRadius: "var(--radius-lg)",
            zIndex: 5,
          }}
        >
          <div
            style={{
              textAlign: "center",
              padding: "20px",
              color: "var(--text-muted)",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {!googleApiKey.trim() ? (
              <>
                <div style={{ marginBottom: 8, fontSize: 16 }}>🔑</div>
                Google Maps API key required
                <br />
                Add it in Settings → Google Maps API Key
              </>
            ) : (
              <>
                <div style={{ marginBottom: 8, fontSize: 16 }}>⚠️</div>
                {loadError?.message ?? "Failed to load Google Maps"}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
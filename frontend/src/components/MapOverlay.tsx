import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAppState } from "../context/AppContext";
import { saveRoute, getAllRoutes, deleteRoute } from "../services/db";
import type { Route, Waypoint } from "../types";

// Fix Leaflet default icon with webpack/vite
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

function RouteClickHandler({ onMapClick }: { onMapClick: (latlng: L.LatLng) => void }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) });
  return null;
}

function PositionUpdater({ waypoints, distance }: { waypoints: Waypoint[]; distance: number }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (waypoints.length < 2) return;

    let accumulated = 0;
    let targetLat = waypoints[0].lat;
    let targetLng = waypoints[0].lng;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i];
      const b = waypoints[i + 1];
      const segDist = haversine(a.lat, a.lng, b.lat, b.lng);
      if (accumulated + segDist >= distance) {
        const frac = segDist > 0 ? (distance - accumulated) / segDist : 0;
        targetLat = a.lat + (b.lat - a.lat) * frac;
        targetLng = a.lng + (b.lng - a.lng) * frac;
        break;
      }
      accumulated += segDist;
      if (i === waypoints.length - 2) {
        targetLat = b.lat;
        targetLng = b.lng;
      }
    }

    if (!markerRef.current) {
      markerRef.current = L.marker([targetLat, targetLng], {
        icon: L.divIcon({
          className: "",
          html: '<div style="width:16px;height:16px;border-radius:50%;background:#4f46e5;border:3px solid #fff;box-shadow:0 0 8px #4f46e5;"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).addTo(map);
    } else {
      markerRef.current.setLatLng([targetLat, targetLng]);
    }

    map.panTo([targetLat, targetLng], { animate: true });
  }, [distance, waypoints, map]);

  return null;
}

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

export default function MapOverlay() {
  const { activeRoute, setActiveRoute, routes, setRoutes, totalDistance, showMap, setShowMap } = useAppState();
  const [editing, setEditing] = useState(false);
  const [editWaypoints, setEditWaypoints] = useState<Waypoint[]>([]);
  const [routeName, setRouteName] = useState("");

  useEffect(() => {
    getAllRoutes().then(setRoutes);
  }, []);

  const handleMapClick = useCallback(
    (latlng: L.LatLng) => {
      if (!editing) return;
      setEditWaypoints((prev) => [...prev, { lat: latlng.lat, lng: latlng.lng }]);
    },
    [editing]
  );

  const startEdit = () => {
    setEditing(true);
    setEditWaypoints([]);
    setRouteName("");
  };

  const saveEdit = async () => {
    if (editWaypoints.length < 2 || !routeName.trim()) return;
    const route: Route = {
      id: Date.now().toString(),
      name: routeName.trim(),
      waypoints: editWaypoints,
      createdAt: Date.now(),
    };
    await saveRoute(route);
    setRoutes(await getAllRoutes());
    setActiveRoute(route);
    setEditing(false);
  };

  const selectRoute = async (route: Route) => {
    setActiveRoute(route);
  };

  const removeRoute = async (id: string) => {
    await deleteRoute(id);
    if (activeRoute?.id === id) setActiveRoute(null);
    setRoutes(await getAllRoutes());
  };

  const waypoints = activeRoute?.waypoints ?? [];
  const totalRouteDistance = waypoints.length >= 2
    ? waypoints.reduce((sum, wp, i) => {
        if (i === 0) return 0;
        return sum + haversine(waypoints[i - 1].lat, waypoints[i - 1].lng, wp.lat, wp.lng);
      }, 0)
    : 0;

  if (!showMap) {
    return (
      <button
        onClick={() => setShowMap(true)}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: 10,
          border: "1px solid #444",
          background: "#1e1e1e",
          color: "#aaa",
          cursor: "pointer",
          fontSize: 14,
          marginBottom: 16,
        }}
      >
        🗺 Show Map
      </button>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button
          onClick={() => setShowMap(false)}
          style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 13 }}
        >
          ✕ Hide Map
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {routes.map((r) => (
            <button
              key={r.id}
              onClick={() => selectRoute(r)}
              onDoubleClick={() => removeRoute(r.id)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: activeRoute?.id === r.id ? "1px solid #4f46e5" : "1px solid #444",
                background: activeRoute?.id === r.id ? "#312e81" : "#1e1e1e",
                color: activeRoute?.id === r.id ? "#eee" : "#888",
                cursor: "pointer",
                fontSize: 12,
              }}
              title="Double-click to delete"
            >
              {r.name}
            </button>
          ))}
          <button
            onClick={editing ? saveEdit : startEdit}
            disabled={editing && (editWaypoints.length < 2 || !routeName.trim())}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #4f46e5",
              background: "#312e81",
              color: "#eee",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {editing ? "💾 Save" : "+ New"}
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ marginBottom: 6 }}>
          <input
            type="text"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="Route name…"
            style={{
              width: "100%",
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1e1e1e",
              color: "#eee",
              fontSize: 13,
            }}
          />
        </div>
      )}

      <div style={{ height: 240, borderRadius: 10, overflow: "hidden" }}>
        <MapContainer
          center={[45.0, 9.0]}
          zoom={6}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RouteClickHandler onMapClick={handleMapClick} />
          {(editing || waypoints.length === 0) && activeRoute && (
            <Polyline positions={waypoints.map((w) => [w.lat, w.lng])} color="#f59e0b" />
          )}
          {editing && editWaypoints.map((wp, i) => (
            <Marker key={i} position={[wp.lat, wp.lng]} />
          ))}
          {!editing && waypoints.length >= 2 && (
            <Polyline positions={waypoints.map((w) => [w.lat, w.lng])} color="#4f46e5" />
          )}
          {!editing && waypoints.length >= 2 && (
            <PositionUpdater waypoints={waypoints} distance={totalDistance} />
          )}
        </MapContainer>
      </div>

      {totalRouteDistance > 0 && (
        <div style={{ fontSize: 12, color: "#666", marginTop: 4, textAlign: "right" }}>
          Route: {totalRouteDistance.toFixed(1)} km
        </div>
      )}
    </div>
  );
}

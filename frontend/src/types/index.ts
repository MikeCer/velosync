export interface VideoMeta {
  videoId: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
}

export interface LibraryVideo {
  id: string;
  title: string;
  filename: string;
  duration: number | null;
  thumbnail: string | null;
  quality: string;
  fileSize: number;
  downloadedAt: number;
  youtubeUrl: string;
  source: "youtube" | "streetview";
  waypoints?: Waypoint[];
  distanceKm?: number;
  description?: string;
  mode?: "static" | "live";
  denseWaypoints?: WaypointWithHeading[];
}

export interface DownloadItem {
  downloadId: string;
  url: string;
  quality: string;
  title: string;
  status: "queued" | "downloading" | "processing" | "completed" | "failed";
  percent: number;
  error?: string;
}

export interface Waypoint {
  lat: number;
  lng: number;
}

export interface Route {
  id: string;
  name: string;
  waypoints: Waypoint[];
  createdAt: number;
}

export interface RouteDraft {
  id: string;
  name: string;
  description: string;
  waypoints: Waypoint[];
  createdAt: number;
}

export interface RouteVideoMeta {
  id: string;
  name: string;
  description: string;
  filename: string;
  waypoints: Waypoint[];
  distance_km: number;
  duration_s: number;
  file_size: number;
  generated_at: number;
  source: "streetview";
  spacing_m?: number;
  cache_id?: string;
  mode?: "static" | "live";
  /** When mode is "live", these are included */
  dense_waypoints?: WaypointWithHeading[];
}

export interface WaypointWithHeading {
  lat: number;
  lng: number;
  heading: number;
}

export interface LiveRouteSaveRequest {
  waypoints: Waypoint[];
  route_name: string;
  description: string;
}

export interface RouteGenerateRequest {
  waypoints: Waypoint[];
  route_name: string;
  description: string;
  api_key: string;
  spacing_m: number;
  cached_route_id?: string;
}

export interface CoverageCheckRequest {
  waypoints: Waypoint[];
  api_key: string;
}

export interface CoverageResult {
  covered: number;
  uncovered: Array<{ lat: number; lng: number; index: number; status: string }>;
  total: number;
}

export interface CacheInfo {
  cache_id: string;
  route_name: string;
  waypoints_count: number;
  frames_count: number;
  waypoints: Waypoint[];
}

export interface SessionRecord {
  id: string;
  date: number;
  videoUrl: string;
  videoTitle: string;
  routeId: string | null;
  duration: number;
  distance: number;
  avgSpeed: number;
  maxSpeed: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  videoSource?: "youtube" | "streetview";
  routeVideoId?: string;
}

export interface BLEDeviceInfo {
  id: string;
  name: string;
  type: "FTMS" | "CSCS";
}

export interface HRMDeviceInfo {
  id: string;
  name: string;
  type: "HRM";
  sensorLocation: string | null;
}

export type SpeedSource = "manual" | "ble" | "velosyncWs";

export interface VeloSyncSpeedMessage {
  type: "speed";
  version: 1;
  seq: number;
  timestampMs: number;
  speedKmh: number;
  instantSpeedKmh: number;
  pulseIntervalMs: number;
  pulseAgeMs: number;
  stopped: boolean;
  wheelCircumferenceM: number;
  magnetsPerRev: number;
  counters: {
    accepted: number;
    rejected: number;
    bounce: number;
  };
}

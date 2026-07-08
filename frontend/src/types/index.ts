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
}

export interface BLEDeviceInfo {
  id: string;
  name: string;
  type: "FTMS" | "CSCS";
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

import type { VideoMeta, LibraryVideo, RouteVideoMeta, RouteGenerateRequest, CoverageCheckRequest, CoverageResult, CacheInfo, LiveRouteSaveRequest, WaypointWithHeading } from "../types";

export interface DownloadState {
  [downloadId: string]: {
    status: string;
    percent: number;
    title: string;
    video_id?: string;
    error?: string;
  };
}

export interface RouteProgressState {
  [genId: string]: {
    status: string;
    percent: number;
    name: string;
    total_frames?: number;
    total_km?: number;
    frames_downloaded?: number;
    route_id?: string;
    filename?: string;
    error?: string;
  };
}

function baseUrl(): string {
  return localStorage.getItem("backendUrl") || "";
}

export function setBackendUrl(url: string): void {
  localStorage.setItem("backendUrl", url);
}

export function getBackendUrl(): string {
  return localStorage.getItem("backendUrl") || "";
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res;
}

export async function fetchVideoInfo(youtubeUrl: string): Promise<VideoMeta> {
  const res = await apiFetch(`/api/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: youtubeUrl }),
  });
  const data = await res.json();
  return {
    videoId: data.video_id,
    title: data.title,
    duration: data.duration,
    thumbnail: data.thumbnail,
  };
}

export async function fetchLibrary(): Promise<LibraryVideo[]> {
  const res = await apiFetch(`/api/videos`);
  const data = await res.json();
  return data.map((v: any) => ({
    id: v.id,
    title: v.title,
    filename: v.filename,
    duration: v.duration,
    thumbnail: v.thumbnail,
    quality: v.quality,
    fileSize: v.file_size,
    downloadedAt: v.downloaded_at,
    youtubeUrl: v.youtube_url,
    source: "youtube" as const,
  }));
}

export async function fetchUnifiedLibrary(): Promise<LibraryVideo[]> {
  const res = await apiFetch(`/api/library`);
  const data = await res.json();
  return data.map((v: any) => ({
    id: v.id,
    title: v.title,
    filename: v.filename,
    duration: v.duration,
    thumbnail: v.thumbnail,
    quality: v.quality,
    fileSize: v.fileSize ?? v.file_size ?? 0,
    downloadedAt: v.downloadedAt ?? v.downloaded_at ?? v.generated_at ?? 0,
    youtubeUrl: v.youtubeUrl ?? "",
    source: v.source as "youtube" | "streetview",
    waypoints: v.waypoints,
    distanceKm: v.distanceKm,
    description: v.description,
    mode: v.mode,
    denseWaypoints: v.denseWaypoints,
  }));
}

export async function deleteVideo(videoId: string): Promise<void> {
  await apiFetch(`/api/videos/${encodeURIComponent(videoId)}`, { method: "DELETE" });
}

export async function startDownload(youtubeUrl: string, quality: string): Promise<{ downloadId: string; title: string }> {
  const res = await apiFetch(`/api/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: youtubeUrl, quality }),
  });
  const data = await res.json();
  return { downloadId: data.download_id, title: data.title };
}

export function getMediaUrl(filename: string): string {
  return `${baseUrl()}/api/media/${encodeURIComponent(filename)}`;
}

export function subscribeDownloadProgress(onUpdate: (state: DownloadState) => void): () => void {
  const url = `${baseUrl()}/api/download/progress`;
  const es = new EventSource(url);
  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onUpdate(data);
    } catch {}
  };
  es.onerror = () => {
    // EventSource auto-reconnects
  };
  return () => es.close();
}

// ── Street View route functions ──────────────────────

export async function generateRouteVideo(request: RouteGenerateRequest): Promise<{ generation_id: string }> {
  const res = await apiFetch(`/api/routes/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return res.json();
}

export async function fetchRouteLibrary(): Promise<RouteVideoMeta[]> {
  const res = await apiFetch(`/api/routes/list`);
  return res.json();
}

export async function deleteRouteVideo(routeId: string): Promise<void> {
  await apiFetch(`/api/routes/${encodeURIComponent(routeId)}`, { method: "DELETE" });
}

export function subscribeRouteProgress(onUpdate: (state: RouteProgressState) => void): () => void {
  const url = `${baseUrl()}/api/routes/progress`;
  const es = new EventSource(url);
  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onUpdate(data);
    } catch {}
  };
  es.onerror = () => {};
  return () => es.close();
}

export async function checkRouteCoverage(request: CoverageCheckRequest): Promise<CoverageResult> {
  const res = await apiFetch(`/api/routes/check-coverage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return res.json();
}

export async function regenerateRouteVideo(request: RouteGenerateRequest): Promise<{ generation_id: string }> {
  const res = await apiFetch(`/api/routes/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return res.json();
}

export async function fetchCacheInfo(cacheId: string): Promise<CacheInfo> {
  const res = await apiFetch(`/api/routes/cache-info/${encodeURIComponent(cacheId)}`);
  return res.json();
}

export async function saveLiveRoute(request: LiveRouteSaveRequest): Promise<{ id: string; duration_s: number; distance_km: number; headings: number[]; dense_waypoints: WaypointWithHeading[] }> {
  const res = await apiFetch(`/api/routes/save-live`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return res.json();
}

export async function fetchRouteWaypoints(routeId: string): Promise<{ route_id: string; waypoints: WaypointWithHeading[]; duration_s: number; distance_km: number }> {
  const res = await apiFetch(`/api/routes/${encodeURIComponent(routeId)}/waypoints`);
  return res.json();
}

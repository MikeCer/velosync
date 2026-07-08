import type { VideoMeta, LibraryVideo } from "../types";

export interface DownloadState {
  [downloadId: string]: {
    status: string;
    percent: number;
    title: string;
    video_id?: string;
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

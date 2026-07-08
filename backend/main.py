"""VeloSync backend: YouTube download & local media library."""

import asyncio
import json
import logging
import mimetypes
import os
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MEDIA_FOLDER = Path(os.environ.get("MEDIA_FOLDER", "./media")).resolve()
MEDIA_FOLDER.mkdir(parents=True, exist_ok=True)
META_FILE = MEDIA_FOLDER / "metadata.json"

app = FastAPI(title="VeloSync backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

active_downloads: dict[str, dict] = {}


class VideoRequest(BaseModel):
    url: str
    quality: Optional[str] = "1080p"


class DownloadResponse(BaseModel):
    download_id: str
    title: str = ""


QUALITY_MAP = {
    "2160p": "bestvideo[height<=2160]+bestaudio/best[height<=2160]",
    "1440p": "bestvideo[height<=1440]+bestaudio/best[height<=1440]",
    "1080p": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    "720p": "bestvideo[height<=720]+bestaudio/best[height<=720]",
    "480p": "bestvideo[height<=480]+bestaudio/best[height<=480]",
    "360p": "18/best",
}


def _find_thumbnail(video_id: str) -> str | None:
    """Find a thumbnail file for a video, checking common extensions."""
    for ext in ("webp", "jpg", "jpeg", "png"):
        candidate = MEDIA_FOLDER / f"{video_id}.{ext}"
        if candidate.exists():
            return candidate.name
    for f in MEDIA_FOLDER.iterdir():
        if f.stem == video_id and f.suffix.lower() in (".webp", ".jpg", ".jpeg", ".png"):
            return f.name
    return None


def _load_metadata() -> list[dict]:
    if not META_FILE.exists():
        return []
    try:
        return json.loads(META_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_metadata(entries: list[dict]) -> None:
    META_FILE.write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")


def _add_video_meta(video_id: str, title: str, filename: str, duration: int | None,
                    quality: str, youtube_url: str) -> None:
    entries = _load_metadata()
    file_path = MEDIA_FOLDER / filename
    file_size = file_path.stat().st_size if file_path.exists() else 0
    thumb = _find_thumbnail(video_id)

    entry = {
        "id": video_id,
        "title": title,
        "filename": filename,
        "duration": duration,
        "thumbnail": thumb,
        "quality": quality,
        "file_size": file_size,
        "downloaded_at": time.time(),
        "youtube_url": youtube_url,
    }
    existing = [e for e in entries if e["id"] != video_id]
    existing.append(entry)
    _save_metadata(existing)


def _remove_video_meta(video_id: str) -> None:
    entries = _load_metadata()
    _save_metadata([e for e in entries if e["id"] != video_id])


def _extract_info_sync(url: str) -> dict:
    import yt_dlp
    opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)


def _run_download(download_id: str, url: str, quality: str) -> None:
    import yt_dlp
    fmt = QUALITY_MAP.get(quality, QUALITY_MAP["1080p"])

    try:
        info = _extract_info_sync(url)
        video_id = info.get("id", download_id)
        title = info.get("title", "Unknown")
        duration = info.get("duration", None)
    except Exception as e:
        active_downloads[download_id] = {"status": "failed", "percent": 0, "error": str(e), "title": url}
        return

    active_downloads[download_id] = {"status": "downloading", "percent": 0, "title": title, "video_id": video_id}
    output_template = str(MEDIA_FOLDER / "%(id)s.%(ext)s")

    def progress_hook(d: dict) -> None:
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            pct = (downloaded / total * 100) if total > 0 else 0
            active_downloads[download_id] = {
                "status": "downloading",
                "percent": round(min(pct, 95), 1),
                "speed": d.get("speed") or 0,
                "eta": d.get("eta") or 0,
                "title": title,
                "video_id": video_id,
            }
        elif d["status"] == "finished":
            active_downloads[download_id] = {
                "status": "processing",
                "percent": 98,
                "title": title,
                "video_id": video_id,
            }

    opts = {
        "quiet": True,
        "no_warnings": True,
        "format": fmt,
        "merge_output_format": "mp4",
        "outtmpl": output_template,
        "writethumbnail": True,
        "progress_hooks": [progress_hook],
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

        # Wait for postprocessors (thumbnail file write)
        time.sleep(2)

        downloaded_file = None
        for ext in ["mp4", "mkv", "webm"]:
            candidate = MEDIA_FOLDER / f"{video_id}.{ext}"
            if candidate.exists():
                downloaded_file = candidate.name
                break

        if downloaded_file:
            _add_video_meta(video_id, title, downloaded_file, duration, quality, url)
            active_downloads[download_id] = {"status": "completed", "percent": 100, "title": title, "video_id": video_id}
        else:
            active_downloads[download_id] = {"status": "failed", "percent": 0, "error": "Output file not found after download", "title": title}
    except Exception as e:
        logger.error(f"Download failed: {e}")
        active_downloads[download_id] = {"status": "failed", "percent": 0, "error": str(e), "title": title}


# ── Routes ──────────────────────────────────────────────

@app.get("/api/videos")
async def list_videos():
    """Return library videos, refreshing thumbnail references on each call."""
    entries = _load_metadata()
    changed = False
    for entry in entries:
        if not entry.get("thumbnail"):
            found = _find_thumbnail(entry["id"])
            if found:
                entry["thumbnail"] = found
                changed = True
    if changed:
        _save_metadata(entries)
    return entries


@app.delete("/api/videos/{video_id}")
async def delete_video(video_id: str):
    entries = _load_metadata()
    entry = next((e for e in entries if e["id"] == video_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Video not found")
    video_file = MEDIA_FOLDER / entry["filename"]
    if video_file.exists():
        video_file.unlink()
    if entry.get("thumbnail"):
        thumb_file = MEDIA_FOLDER / entry["thumbnail"]
        if thumb_file.exists():
            thumb_file.unlink()
    thumb = _find_thumbnail(video_id)
    if thumb:
        (MEDIA_FOLDER / thumb).unlink(missing_ok=True)
    _remove_video_meta(video_id)
    return {"ok": True}


@app.post("/api/info")
async def get_video_info(body: VideoRequest):
    try:
        info = await asyncio.to_thread(_extract_info_sync, body.url)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {
        "video_id": info.get("id", ""),
        "title": info.get("title", "Unknown"),
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
    }


@app.post("/api/download", response_model=DownloadResponse)
async def start_download(body: VideoRequest):
    download_id = uuid.uuid4().hex[:12]
    try:
        info = await asyncio.to_thread(_extract_info_sync, body.url)
        title = info.get("title", "Unknown")
    except Exception:
        title = "Unknown"

    active_downloads[download_id] = {"status": "queued", "percent": 0, "title": title}
    asyncio.get_event_loop().run_in_executor(
        None, _run_download, download_id, body.url, body.quality or "1080p"
    )
    return DownloadResponse(download_id=download_id, title=title)


@app.get("/api/download/progress")
async def download_progress():
    async def generate():
        while True:
            data = json.dumps(active_downloads)
            yield f"data: {data}\n\n"
            await asyncio.sleep(0.5)
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/download/queue")
async def get_download_queue():
    return active_downloads


@app.get("/api/media/{filename:path}")
async def serve_media(filename: str):
    file_path = MEDIA_FOLDER / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if not file_path.is_relative_to(MEDIA_FOLDER):
        raise HTTPException(status_code=403, detail="Access denied")

    mime_type, _ = mimetypes.guess_type(str(file_path))
    if mime_type is None:
        mime_type = "application/octet-stream"

    return FileResponse(
        file_path,
        media_type=mime_type,
        headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400"},
    )


@app.get("/api/health")
async def health():
    entries = _load_metadata()
    total_bytes = sum(e.get("file_size", 0) for e in entries)
    return {
        "status": "ok",
        "video_count": len(entries),
        "total_size_gb": round(total_bytes / (1024**3), 2),
        "media_folder": str(MEDIA_FOLDER),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

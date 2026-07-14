"""YouTube video endpoints: info, download, library, and progress."""

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.config import MEDIA_FOLDER
from backend.models.schemas import VideoRequest, DownloadResponse
from backend.services import downloader, persistence

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["videos"])

# Mutable state shared across requests
active_downloads: dict[str, dict] = {}


@router.get("/videos")
async def list_videos():
    """Return library videos, refreshing thumbnail references on each call."""
    return persistence.get_videos_metadata()


@router.delete("/videos/{video_id}")
async def delete_video(video_id: str):
    entries = persistence.get_videos_metadata()
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

    thumb = persistence.find_thumbnail(video_id)
    if thumb:
        (MEDIA_FOLDER / thumb).unlink(missing_ok=True)

    persistence.remove_video_meta(video_id)
    return {"ok": True}


@router.post("/info")
async def get_video_info(body: VideoRequest):
    try:
        info = await asyncio.to_thread(downloader.extract_info, body.url)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {
        "video_id": info.get("id", ""),
        "title": info.get("title", "Unknown"),
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
    }


@router.post("/download", response_model=DownloadResponse)
async def start_download(body: VideoRequest):
    download_id = uuid.uuid4().hex[:12]
    try:
        info = await asyncio.to_thread(downloader.extract_info, body.url)
        title = info.get("title", "Unknown")
    except Exception:
        title = "Unknown"

    active_downloads[download_id] = {"status": "queued", "percent": 0, "title": title}
    asyncio.get_event_loop().run_in_executor(
        None,
        downloader.run_download,
        download_id,
        body.url,
        body.quality or "1080p",
        active_downloads,
    )
    return DownloadResponse(download_id=download_id, title=title)


@router.get("/download/progress")
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


@router.get("/download/queue")
async def get_download_queue():
    return active_downloads
"""YouTube download service using yt-dlp."""

import logging
import time

from backend.config import MEDIA_FOLDER, QUALITY_MAP
from backend.services.persistence import add_video_meta

logger = logging.getLogger(__name__)


def extract_info(url: str) -> dict:
    """Synchronous extraction — called via asyncio.to_thread."""
    import yt_dlp

    opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)


def run_download(
    download_id: str,
    url: str,
    quality: str,
    active_downloads: dict,  # mutable dict owned by the router
) -> None:
    """Background download task — updates active_downloads in-place."""
    import yt_dlp

    fmt = QUALITY_MAP.get(quality, QUALITY_MAP["1080p"])

    try:
        info = extract_info(url)
        video_id = info.get("id", download_id)
        title = info.get("title", "Unknown")
        duration_val = info.get("duration", None)
    except Exception as e:
        active_downloads[download_id] = {
            "status": "failed", "percent": 0, "error": str(e), "title": url,
        }
        return

    active_downloads[download_id] = {
        "status": "downloading", "percent": 0, "title": title, "video_id": video_id,
    }
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
            add_video_meta(video_id, title, downloaded_file, duration_val, quality, url)
            active_downloads[download_id] = {
                "status": "completed", "percent": 100, "title": title, "video_id": video_id,
            }
        else:
            active_downloads[download_id] = {
                "status": "failed", "percent": 0,
                "error": "Output file not found after download", "title": title,
            }
    except Exception as e:
        logger.error(f"Download failed: {e}")
        active_downloads[download_id] = {
            "status": "failed", "percent": 0, "error": str(e), "title": title,
        }
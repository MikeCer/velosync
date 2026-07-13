"""VeloSync backend configuration — paths, quality maps, and constants."""

import os
from pathlib import Path

MEDIA_FOLDER = Path(os.environ.get("MEDIA_FOLDER", "./media")).resolve()
MEDIA_FOLDER.mkdir(parents=True, exist_ok=True)

META_FILE = MEDIA_FOLDER / "metadata.json"
ROUTES_META_FILE = MEDIA_FOLDER / "routes_metadata.json"
ROUTES_CACHE = MEDIA_FOLDER / "routes_cache"
ROUTES_CACHE.mkdir(parents=True, exist_ok=True)
FRAMES_CACHE = MEDIA_FOLDER / "frames_cache"
FRAMES_CACHE.mkdir(parents=True, exist_ok=True)

# Static Street View capture and video output settings.
STREETVIEW_STATIC_SIZE = "600x300"
STREETVIEW_STATIC_FOV = 120
STREETVIEW_OUTPUT_SIZE = "1280x720"

# YouTube download quality → yt-dlp format string
QUALITY_MAP: dict[str, str] = {
    "2160p": "bestvideo[height<=2160]+bestaudio/best[height<=2160]",
    "1440p": "bestvideo[height<=1440]+bestaudio/best[height<=1440]",
    "1080p": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    "720p":  "bestvideo[height<=720]+bestaudio/best[height<=720]",
    "480p":  "bestvideo[height<=480]+bestaudio/best[height<=480]",
    "360p":  "18/best",
}
"""Media serving, health check, and unified library endpoints."""

import mimetypes

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.config import MEDIA_FOLDER
from backend.services import persistence

router = APIRouter(prefix="/api", tags=["media"])


@router.get("/media/{filename:path}")
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


@router.get("/health")
async def health():
    videos = persistence.get_videos_metadata()
    routes = persistence.get_routes_metadata()
    total_bytes = sum(e.get("file_size", 0) for e in videos)
    total_bytes += sum(e.get("file_size", 0) for e in routes)
    return {
        "status": "ok",
        "video_count": len(videos),
        "route_video_count": len(routes),
        "total_size_gb": round(total_bytes / (1024 ** 3), 2),
        "media_folder": str(MEDIA_FOLDER),
    }


@router.get("/library")
async def unified_library():
    """Return all videos (YouTube + Street View) in a unified format."""
    videos = persistence.get_videos_metadata()
    routes = persistence.get_routes_metadata()

    unified = []
    for v in videos:
        unified.append({
            "id": v["id"],
            "title": v["title"],
            "filename": v["filename"],
            "duration": v.get("duration"),
            "thumbnail": v.get("thumbnail"),
            "quality": v.get("quality"),
            "fileSize": v.get("file_size", 0),
            "downloadedAt": v.get("downloaded_at"),
            "youtubeUrl": v.get("youtube_url", ""),
            "source": "youtube",
        })

    for r in routes:
            entry = {
            "id": r["id"],
            "title": r["name"],
                "filename": r.get("filename"),
            "duration": r.get("duration_s"),
            "thumbnail": None,
            "quality": "streetview",
            "fileSize": r.get("file_size", 0),
            "downloadedAt": r.get("generated_at"),
            "source": "streetview",
                "mode": r.get("mode", "static"),
                "waypoints": r.get("waypoints", []),
                "distanceKm": r.get("distance_km", 0),
                "description": r.get("description", ""),
            }
            if r.get("dense_waypoints") and r.get("headings"):
                entry["denseWaypoints"] = [
                    {"lat": w["lat"], "lng": w["lng"], "heading": r["headings"][i]
                     if i < len(r.get("headings", [])) else 0}
                    for i, w in enumerate(r["dense_waypoints"])
                ]
            unified.append(entry)

    return unified
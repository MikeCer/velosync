"""VeloSync backend: YouTube download, Street View route generation & local media library."""

import asyncio
import json
import logging
import math
import mimetypes
import os
import subprocess
import tempfile
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
ROUTES_META_FILE = MEDIA_FOLDER / "routes_metadata.json"
ROUTES_CACHE = MEDIA_FOLDER / "routes_cache"
ROUTES_CACHE.mkdir(parents=True, exist_ok=True)
FRAMES_CACHE = MEDIA_FOLDER / "frames_cache"
FRAMES_CACHE.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="VeloSync backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

active_downloads: dict[str, dict] = {}
active_route_generations: dict[str, dict] = {}


class VideoRequest(BaseModel):
    url: str
    quality: Optional[str] = "1080p"


class DownloadResponse(BaseModel):
    download_id: str
    title: str = ""


class Waypoint(BaseModel):
    lat: float
    lng: float


class CoverageCheckRequest(BaseModel):
    waypoints: list[Waypoint]
    api_key: str


class RouteGenerateRequest(BaseModel):
    waypoints: list[Waypoint]
    route_name: str
    description: str = ""
    api_key: str
    spacing_m: float = 10.0
    quality: str = "high"
    cached_route_id: Optional[str] = None  # If regenerating from cached route


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance in km between two lat/lng points."""
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Bearing in degrees from point 1 to point 2."""
    d_lng = math.radians(lng2 - lng1)
    y = math.sin(d_lng) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(d_lng)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _interpolate_waypoints(waypoints: list[Waypoint], spacing_m: float = 10.0) -> list[Waypoint]:
    """Interpolate waypoints to have points spaced roughly `spacing_m` meters apart."""
    if len(waypoints) < 2:
        return waypoints

    result: list[Waypoint] = [waypoints[0]]
    for i in range(len(waypoints) - 1):
        a = waypoints[i]
        b = waypoints[i + 1]
        seg_dist_km = _haversine(a.lat, a.lng, b.lat, b.lng)
        seg_dist_m = seg_dist_km * 1000
        if seg_dist_m <= spacing_m:
            result.append(b)
            continue
        num_steps = max(1, int(seg_dist_m / spacing_m))
        for step in range(1, num_steps):
            frac = step / num_steps
            lat = a.lat + (b.lat - a.lat) * frac
            lng = a.lng + (b.lng - a.lng) * frac
            result.append(Waypoint(lat=lat, lng=lng))
        result.append(b)
    return result


def _total_distance_km(waypoints: list[Waypoint]) -> float:
    total = 0.0
    for i in range(len(waypoints) - 1):
        total += _haversine(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng)
    return round(total, 2)


def _load_routes_metadata() -> list[dict]:
    if not ROUTES_META_FILE.exists():
        return []
    try:
        return json.loads(ROUTES_META_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_routes_metadata(entries: list[dict]) -> None:
    ROUTES_META_FILE.write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")


QUALITY_SIZE_MAP = {
    "high": "1920x1080",
    "medium": "1280x720",
    "low": "640x400",
}

def _frame_cache_key(lat: float, lng: float, heading: float, quality: str = "high") -> str:
    """Cache key for a Street View frame, rounded to avoid floating point differences."""
    return f"{round(lat, 5)}_{round(lng, 5)}_{round(heading, 0)}_{quality}.jpg"


def _cached_frame_path(lat: float, lng: float, heading: float, quality: str = "high") -> Path:
    return FRAMES_CACHE / _frame_cache_key(lat, lng, heading, quality)


def _run_route_generation(gen_id: str, req: RouteGenerateRequest) -> None:
    """Background task: fetch Street View frames and stitch into MP4."""
    import httpx

    try:
        waypoints = req.waypoints

        # If regenerating from a cached route, load the dense waypoints
        if req.cached_route_id:
            cache_file = ROUTES_CACHE / f"{req.cached_route_id}.json"
            if cache_file.exists():
                cache_data = json.loads(cache_file.read_text(encoding="utf-8"))
                waypoints = [Waypoint(lat=w["lat"], lng=w["lng"]) for w in cache_data.get("original_waypoints", [])]
                if not waypoints:
                    waypoints = req.waypoints
            if len(waypoints) < 2:
                active_route_generations[gen_id] = {"status": "failed", "percent": 0, "error": "Cached route has no waypoints", "name": req.route_name}
                return

        if len(waypoints) < 2:
            active_route_generations[gen_id] = {"status": "failed", "percent": 0, "error": "At least 2 waypoints required", "name": req.route_name}
            return

        # Interpolate to user-specified spacing
        dense = _interpolate_waypoints(waypoints, spacing_m=req.spacing_m)
        total_km = _total_distance_km(dense)

        # Save route cache for future regeneration
        route_cache_file = ROUTES_CACHE / f"{gen_id}.json"
        route_cache_file.write_text(json.dumps({
            "route_name": req.route_name,
            "description": req.description,
            "spacing_m": req.spacing_m,
            "original_waypoints": [{"lat": w.lat, "lng": w.lng} for w in waypoints],
            "dense_waypoints": [{"lat": w.lat, "lng": w.lng} for w in dense],
        }, indent=2, ensure_ascii=False), encoding="utf-8")

        active_route_generations[gen_id] = {
            "status": "generating", "percent": 0, "name": req.route_name,
            "total_frames": len(dense), "total_km": total_km,
            "cache_id": gen_id,
        }

        # Fetch Street View frames (with caching)
        tmpdir = Path(tempfile.mkdtemp(prefix="velosync_route_"))
        frame_paths: list[Path] = []
        cached_count = 0
        downloaded_count = 0

        quality = getattr(req, "quality", "high") or "high"
        image_size = QUALITY_SIZE_MAP.get(quality, QUALITY_SIZE_MAP["high"])

        for idx, wp in enumerate(dense):
            # Compute heading to next point (or use previous heading for last point)
            if idx < len(dense) - 1:
                heading = _bearing(wp.lat, wp.lng, dense[idx + 1].lat, dense[idx + 1].lng)
            else:
                heading = _bearing(dense[idx - 1].lat, dense[idx - 1].lng, wp.lat, wp.lng)

            # Check frame cache first
            cached_frame = _cached_frame_path(wp.lat, wp.lng, heading, quality)
            if cached_frame.exists():
                frame_paths.append(cached_frame)
                cached_count += 1
            else:
                url = (
                    f"https://maps.googleapis.com/maps/api/streetview"
                    f"?location={wp.lat},{wp.lng}"
                    f"&size={image_size}"
                    f"&heading={heading:.1f}"
                    f"&fov=120"
                    f"&pitch=0"
                    f"&key={req.api_key}"
                )

                try:
                    resp = httpx.get(url, timeout=30, follow_redirects=True)
                    resp.raise_for_status()

                    content_type = resp.headers.get("content-type", "")
                    if "image" not in content_type:
                        logger.warning(f"No Street View imagery at {wp.lat},{wp.lng} — skipping")
                        continue

                    # Save to cache and use from cache
                    cached_frame.write_bytes(resp.content)
                    frame_paths.append(cached_frame)
                    downloaded_count += 1

                except Exception as e:
                    logger.warning(f"Failed to fetch Street View at point {idx}: {e}")
                    continue

            # Update progress
            pct = round((idx + 1) / len(dense) * 60, 1)  # 0-60% for downloading
            active_route_generations[gen_id] = {
                **active_route_generations[gen_id],
                "percent": min(pct, 60),
                "frames_downloaded": len(frame_paths),
                "cached_frames": cached_count,
                "downloaded_frames": downloaded_count,
            }

        if len(frame_paths) < 2:
            active_route_generations[gen_id] = {"status": "failed", "percent": 0, "error": "Not enough Street View imagery available along route", "name": req.route_name}
            _cleanup_tmpdir(tmpdir)
            return

        active_route_generations[gen_id] = {
            **active_route_generations[gen_id],
            "status": "stitching", "percent": 70,
        }

        # Stitch frames into MP4 with FFmpeg
        # Create a concat file listing all frames
        concat_file = tmpdir / "frames.txt"
        with open(concat_file, "w") as f:
            for fp in frame_paths:
                # Each frame displayed for 1 second at baseline speed
                f.write(f"file '{fp.as_posix()}'\n")
                f.write("duration 1\n")
            # FFmpeg concat demuxer needs last frame repeated
            if frame_paths:
                f.write(f"file '{frame_paths[-1].as_posix()}'\n")

        route_id = gen_id[:12]
        output_file = MEDIA_FOLDER / f"route_{route_id}.mp4"

        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(concat_file),
            "-vsync", "vfr",
                    "-vf", (
                                "crop=iw*0.75:ih:iw*0.125:0,"
                                "scale=1920:1080,setsar=1,"
                        "fps=30,"
                        "minterpolate=fps=30:mi_mode=blend:me_mode=bidir:vsbmc=1"
                    ),
                    "-pix_fmt", "yuv420p",
                    "-c:v", "libx264",
                    "-preset", "medium",
                    "-crf", "23",
                    str(output_file),
                ]

        active_route_generations[gen_id]["percent"] = 80

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            logger.error(f"FFmpeg failed: {result.stderr}")
            active_route_generations[gen_id] = {"status": "failed", "percent": 0, "error": f"FFmpeg error: {result.stderr[:200]}", "name": req.route_name}
            _cleanup_tmpdir(tmpdir)
            return

        # Save metadata
        entries = _load_routes_metadata()
        video_duration = len(frame_paths)  # one second per frame
        entry = {
            "id": route_id,
            "name": req.route_name,
            "description": req.description,
            "filename": f"route_{route_id}.mp4",
            "waypoints": [{"lat": w.lat, "lng": w.lng} for w in req.waypoints],
            "distance_km": total_km,
            "duration_s": video_duration,
            "file_size": output_file.stat().st_size if output_file.exists() else 0,
            "generated_at": time.time(),
            "source": "streetview",
                    "spacing_m": req.spacing_m,
                    "cache_id": gen_id,
                }
        entries.append(entry)
        _save_routes_metadata(entries)

        active_route_generations[gen_id] = {
            "status": "completed", "percent": 100, "name": req.route_name,
            "route_id": route_id, "filename": f"route_{route_id}.mp4",
        }

        _cleanup_tmpdir(tmpdir)

    except Exception as e:
        logger.error(f"Route generation failed: {e}")
        active_route_generations[gen_id] = {"status": "failed", "percent": 0, "error": str(e), "name": req.route_name}


def _cleanup_tmpdir(tmpdir: Path) -> None:
    """Remove temporary directory."""
    import shutil
    try:
        shutil.rmtree(tmpdir, ignore_errors=True)
    except Exception:
        pass


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
    route_entries = _load_routes_metadata()
    total_bytes = sum(e.get("file_size", 0) for e in entries)
    total_bytes += sum(e.get("file_size", 0) for e in route_entries)
    return {
        "status": "ok",
        "video_count": len(entries),
        "route_video_count": len(route_entries),
        "total_size_gb": round(total_bytes / (1024**3), 2),
        "media_folder": str(MEDIA_FOLDER),
    }


# ── Unified library ───────────────────────────────────

@app.get("/api/library")
async def unified_library():
    """Return all videos (YouTube + Street View) in a unified format."""
    videos = _load_metadata()
    routes = _load_routes_metadata()

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
        unified.append({
            "id": r["id"],
            "title": r["name"],
            "filename": r["filename"],
            "duration": r.get("duration_s"),
            "thumbnail": None,
            "quality": "streetview",
            "fileSize": r.get("file_size", 0),
            "downloadedAt": r.get("generated_at"),
            "source": "streetview",
            "waypoints": r.get("waypoints", []),
            "distanceKm": r.get("distance_km", 0),
            "description": r.get("description", ""),
        })

    return unified


# ── Street View route generation ──────────────────────

@app.post("/api/routes/generate")
async def generate_route(body: RouteGenerateRequest):
    gen_id = uuid.uuid4().hex[:16]

    # Quick API key validation
    import httpx
    try:
        test_url = f"https://maps.googleapis.com/maps/api/streetview/metadata?location={body.waypoints[0].lat},{body.waypoints[0].lng}&key={body.api_key}"
        test_resp = httpx.get(test_url, timeout=10)
        test_data = test_resp.json()
        status = test_data.get("status", "")
        if status == "REQUEST_DENIED":
            raise HTTPException(status_code=400, detail="Invalid Google API key or Street View Static API not enabled")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Google APIs — check your network")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API key validation error: {str(e)}")

    active_route_generations[gen_id] = {"status": "starting", "percent": 0, "name": body.route_name}
    asyncio.get_event_loop().run_in_executor(None, _run_route_generation, gen_id, body)

    return {"generation_id": gen_id, "status": "started"}


@app.post("/api/routes/check-coverage")
async def check_coverage(body: CoverageCheckRequest):
    """Check which waypoints have Street View coverage by sampling every ~100m."""
    import httpx

    if len(body.waypoints) < 2:
        return {"covered": [], "uncovered": []}

    # Sample waypoints at ~100m intervals (coverage doesn't change every 10m)
    sampled = _interpolate_waypoints(body.waypoints, spacing_m=100.0)

    uncovered: list[dict] = []
    checked = 0

    for i, wp in enumerate(sampled):
        if i % 5 != 0 and i != len(sampled) - 1:
            continue  # Check every ~500m for performance, plus last point

        url = (
            f"https://maps.googleapis.com/maps/api/streetview/metadata"
            f"?location={wp.lat},{wp.lng}"
            f"&key={body.api_key}"
        )
        try:
            resp = httpx.get(url, timeout=10)
            data = resp.json()
            checked += 1
            status = data.get("status", "")
            if status != "OK":
                uncovered.append({"lat": wp.lat, "lng": wp.lng, "index": i, "status": status})
        except Exception:
            uncovered.append({"lat": wp.lat, "lng": wp.lng, "index": i, "status": "ERROR"})

    return {
        "covered": checked - len(uncovered),
        "uncovered": uncovered,
        "total": checked,
    }


@app.get("/api/routes/list")
async def list_routes():
    """List all generated Street View route videos."""
    return _load_routes_metadata()


@app.delete("/api/routes/{route_id}")
async def delete_route(route_id: str):
    entries = _load_routes_metadata()
    entry = next((e for e in entries if e["id"] == route_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Route video not found")

    video_file = MEDIA_FOLDER / entry["filename"]
    if video_file.exists():
        video_file.unlink()

    # Clean up cached route data
    cache_id = entry.get("cache_id")
    if cache_id:
        cache_file = ROUTES_CACHE / f"{cache_id}.json"
        cache_file.unlink(missing_ok=True)

    _save_routes_metadata([e for e in entries if e["id"] != route_id])
    return {"ok": True}


@app.post("/api/routes/regenerate")
async def regenerate_route(body: RouteGenerateRequest):
    """Regenerate a video from a previously cached route. Requires cached_route_id."""
    if not body.cached_route_id:
            raise HTTPException(status_code=400, detail="cached_route_id is required for regeneration")

    # Load cached route data
    cache_file = ROUTES_CACHE / f"{body.cached_route_id}.json"
    if not cache_file.exists():
        raise HTTPException(status_code=404, detail="Cached route not found")

    # Generate will use the cached frames path for this cache_id
    return await _run_route_generation(body)


@app.get("/api/routes/cache-info/{cache_id}")
async def cache_info(cache_id: str):
    """Get info about a cached route (frames count, coords, etc.) for regeneration UI."""
    cache_file = ROUTES_CACHE / f"{cache_id}.json"
    if not cache_file.exists():
        raise HTTPException(status_code=404, detail="Cached route not found")

    data = json.loads(cache_file.read_text())
    frames_dir = FRAMES_CACHE / cache_id
    frames_count = len(list(frames_dir.glob("*.jpg"))) if frames_dir.exists() else 0

    return {
        "cache_id": cache_id,
        "route_name": data.get("route_name", ""),
        "waypoints_count": len(data.get("waypoints", [])),
        "frames_count": frames_count,
        "waypoints": data.get("waypoints", []),
    }


@app.get("/api/routes/progress")
async def route_progress():
    """SSE stream for route generation progress."""
    async def generate():
        while True:
            data = json.dumps(active_route_generations)
            yield f"data: {data}\n\n"
            await asyncio.sleep(0.5)
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

"""Street View frame fetching, caching, and FFmpeg video stitching."""

import json
import logging
import subprocess
import tempfile
import time
from pathlib import Path

from backend.config import FRAMES_CACHE, MEDIA_FOLDER, QUALITY_SIZE_MAP, ROUTES_CACHE
from backend.models.schemas import Waypoint, RouteGenerateRequest
from backend.services.geo import bearing, interpolate_waypoints, total_distance_km
from backend.services.persistence import add_route_meta

logger = logging.getLogger(__name__)


# ── Frame caching helpers ───────────────────────────────

def _frame_cache_key(lat: float, lng: float, heading: float, quality: str = "high") -> str:
    return f"{round(lat, 5)}_{round(lng, 5)}_{round(heading, 0)}_{quality}.jpg"


def _cached_frame_path(lat: float, lng: float, heading: float, quality: str = "high") -> Path:
    return FRAMES_CACHE / _frame_cache_key(lat, lng, heading, quality)


# ── Internal helpers ────────────────────────────────────

def _cleanup_tmpdir(tmpdir: Path) -> None:
    import shutil
    try:
        shutil.rmtree(tmpdir, ignore_errors=True)
    except Exception:
        pass


# ── Route generation (background task) ──────────────────

def run_route_generation(
    gen_id: str,
    req: RouteGenerateRequest,
    active_route_generations: dict,  # mutable dict owned by the router
) -> None:
    """Background task: fetch Street View frames and stitch into MP4."""
    import httpx

    try:
        waypoints = req.waypoints

        # If regenerating from a cached route, load the dense waypoints
        if req.cached_route_id:
            cache_file = ROUTES_CACHE / f"{req.cached_route_id}.json"
            if cache_file.exists():
                cache_data = json.loads(cache_file.read_text(encoding="utf-8"))
                waypoints = [
                    Waypoint(lat=w["lat"], lng=w["lng"])
                    for w in cache_data.get("original_waypoints", [])
                ]
                if not waypoints:
                    waypoints = req.waypoints
            if len(waypoints) < 2:
                active_route_generations[gen_id] = {
                    "status": "failed", "percent": 0,
                    "error": "Cached route has no waypoints", "name": req.route_name,
                }
                return

        if len(waypoints) < 2:
            active_route_generations[gen_id] = {
                "status": "failed", "percent": 0,
                "error": "At least 2 waypoints required", "name": req.route_name,
            }
            return

        # Interpolate to user-specified spacing
        dense = interpolate_waypoints(waypoints, spacing_m=req.spacing_m)
        total_km = total_distance_km(dense)

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
            # Compute heading to next point (or use previous heading for last)
            if idx < len(dense) - 1:
                heading_val = bearing(wp.lat, wp.lng, dense[idx + 1].lat, dense[idx + 1].lng)
            else:
                heading_val = bearing(dense[idx - 1].lat, dense[idx - 1].lng, wp.lat, wp.lng)

            # Check frame cache first
            cached_frame = _cached_frame_path(wp.lat, wp.lng, heading_val, quality)
            if cached_frame.exists():
                frame_paths.append(cached_frame)
                cached_count += 1
            else:
                url = (
                    f"https://maps.googleapis.com/maps/api/streetview"
                    f"?location={wp.lat},{wp.lng}"
                    f"&size={image_size}"
                    f"&heading={heading_val:.1f}"
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

            # Update progress (0-60 % for downloading)
            pct = round((idx + 1) / len(dense) * 60, 1)
            active_route_generations[gen_id] = {
                **active_route_generations[gen_id],
                "percent": min(pct, 60),
                "frames_downloaded": len(frame_paths),
                "cached_frames": cached_count,
                "downloaded_frames": downloaded_count,
            }

        if len(frame_paths) < 2:
            active_route_generations[gen_id] = {
                "status": "failed", "percent": 0,
                "error": "Not enough Street View imagery available along route",
                "name": req.route_name,
            }
            _cleanup_tmpdir(tmpdir)
            return

        active_route_generations[gen_id] = {
            **active_route_generations[gen_id],
            "status": "stitching", "percent": 70,
        }

        # Stitch frames into MP4 with FFmpeg
        concat_file = tmpdir / "frames.txt"
        with open(concat_file, "w") as f:
            for fp in frame_paths:
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
            active_route_generations[gen_id] = {
                "status": "failed", "percent": 0,
                "error": f"FFmpeg error: {result.stderr[:200]}",
                "name": req.route_name,
            }
            _cleanup_tmpdir(tmpdir)
            return

        # Save metadata
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
                        "mode": "static",
                        "spacing_m": req.spacing_m,
                        "cache_id": gen_id,
        }
        add_route_meta(entry)

        active_route_generations[gen_id] = {
            "status": "completed", "percent": 100, "name": req.route_name,
            "route_id": route_id, "filename": f"route_{route_id}.mp4",
        }

        _cleanup_tmpdir(tmpdir)

    except Exception as e:
        logger.error(f"Route generation failed: {e}")
        active_route_generations[gen_id] = {
            "status": "failed", "percent": 0, "error": str(e), "name": req.route_name,
        }


# ── Coverage check ──────────────────────────────────────

def check_coverage(waypoints: list[Waypoint], api_key: str) -> dict:
    """Check which waypoints have Street View coverage by sampling every ~500m."""
    import httpx

    if len(waypoints) < 2:
        return {"covered": 0, "uncovered": [], "total": 0}

    # Sample waypoints at ~100m intervals (coverage doesn't change every 10m)
    sampled = interpolate_waypoints(waypoints, spacing_m=100.0)

    uncovered: list[dict] = []
    checked = 0

    for i, wp in enumerate(sampled):
        if i % 5 != 0 and i != len(sampled) - 1:
            continue  # Check every ~500m for performance, plus last point

        url = (
            f"https://maps.googleapis.com/maps/api/streetview/metadata"
            f"?location={wp.lat},{wp.lng}"
            f"&key={api_key}"
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
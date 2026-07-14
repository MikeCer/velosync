"""Metadata persistence layer — JSON file CRUD for YouTube videos and Street View routes."""

import json
import logging
import time

from backend.config import MEDIA_FOLDER, META_FILE, ROUTES_META_FILE

logger = logging.getLogger(__name__)


# ── YouTube video metadata ──────────────────────────────

def _load_metadata() -> list[dict]:
    if not META_FILE.exists():
        return []
    try:
        return json.loads(META_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_metadata(entries: list[dict]) -> None:
    META_FILE.write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")


def find_thumbnail(video_id: str) -> str | None:
    """Find a thumbnail file for a video, checking common extensions."""
    for ext in ("webp", "jpg", "jpeg", "png"):
        candidate = MEDIA_FOLDER / f"{video_id}.{ext}"
        if candidate.exists():
            return candidate.name
    for f in MEDIA_FOLDER.iterdir():
        if f.stem == video_id and f.suffix.lower() in (".webp", ".jpg", ".jpeg", ".png"):
            return f.name
    return None


def add_video_meta(
    video_id: str,
    title: str,
    filename: str,
    duration: int | None,
    quality: str,
    youtube_url: str,
) -> None:
    entries = _load_metadata()
    file_path = MEDIA_FOLDER / filename
    file_size = file_path.stat().st_size if file_path.exists() else 0
    thumb = find_thumbnail(video_id)

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


def remove_video_meta(video_id: str) -> None:
    entries = _load_metadata()
    _save_metadata([e for e in entries if e["id"] != video_id])


def get_videos_metadata() -> list[dict]:
    """Return video entries, refreshing thumbnail references on each call."""
    entries = _load_metadata()
    changed = False
    for entry in entries:
        if not entry.get("thumbnail"):
            found = find_thumbnail(entry["id"])
            if found:
                entry["thumbnail"] = found
                changed = True
    if changed:
        _save_metadata(entries)
    return entries


# ── Route (Street View) metadata ────────────────────────

def _load_routes_metadata() -> list[dict]:
    if not ROUTES_META_FILE.exists():
        return []
    try:
        return json.loads(ROUTES_META_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_routes_metadata(entries: list[dict]) -> None:
    ROUTES_META_FILE.write_text(
        json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def get_routes_metadata() -> list[dict]:
    return _load_routes_metadata()


def add_route_meta(entry: dict) -> None:
    entries = _load_routes_metadata()
    entries.append(entry)
    _save_routes_metadata(entries)


def remove_route_meta(route_id: str) -> None:
    entries = _load_routes_metadata()
    _save_routes_metadata([e for e in entries if e["id"] != route_id])


def find_route_meta(route_id: str) -> dict | None:
    entries = _load_routes_metadata()
    return next((e for e in entries if e["id"] == route_id), None)


def save_live_route(
    route_id: str,
    name: str,
    description: str,
    waypoints: list[dict],
    dense_waypoints: list[dict],
    headings: list[float],
    spacing_m: float,
    total_km: float,
) -> dict:
    """Save a live Street View route (no video file — streaming during training)."""
    entry = {
        "id": route_id,
        "name": name,
        "description": description,
        "filename": None,  # No file — live streaming
        "waypoints": waypoints,
        "dense_waypoints": dense_waypoints,
        "headings": headings,
        "distance_km": total_km,
        "duration_s": len(dense_waypoints),  # 1 second per frame baseline
        "file_size": 0,
        "generated_at": None,
        "source": "streetview",
        "mode": "live",
        "spacing_m": spacing_m,
        "cache_id": None,
    }
    entries = _load_routes_metadata()
    entries.append(entry)
    _save_routes_metadata(entries)
    return entry
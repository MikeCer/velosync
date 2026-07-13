"""Street View route endpoints: generate, list, delete, regenerate, cache info, coverage, progress."""

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.config import ROUTES_CACHE, FRAMES_CACHE, MEDIA_FOLDER
from backend.models.schemas import RouteGenerateRequest, CoverageCheckRequest, LiveRouteSaveRequest
from backend.services import streetview, persistence, geo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/routes", tags=["routes"])

# Mutable state shared across requests
active_route_generations: dict[str, dict] = {}


@router.post("/generate")
async def generate_route(body: RouteGenerateRequest):
    gen_id = uuid.uuid4().hex[:16]

    # Quick API key validation
    import httpx
    try:
        test_url = (
            f"https://maps.googleapis.com/maps/api/streetview/metadata"
            f"?location={body.waypoints[0].lat},{body.waypoints[0].lng}&key={body.api_key}"
        )
        test_resp = httpx.get(test_url, timeout=10)
        test_data = test_resp.json()
        status = test_data.get("status", "")
        if status == "REQUEST_DENIED":
            raise HTTPException(
                status_code=400,
                detail="Invalid Google API key or Street View Static API not enabled",
            )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Google APIs — check your network")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API key validation error: {str(e)}")

    active_route_generations[gen_id] = {
        "status": "starting", "percent": 0, "name": body.route_name,
    }
    asyncio.get_event_loop().run_in_executor(
        None, streetview.run_route_generation, gen_id, body, active_route_generations,
    )

    return {"generation_id": gen_id, "status": "started"}


@router.post("/check-coverage")
async def check_coverage(body: CoverageCheckRequest):
    """Check which waypoints have Street View coverage."""
    result = streetview.check_coverage(body.waypoints, body.api_key)
    return result


@router.get("/list")
async def list_routes():
    """List all generated Street View route videos."""
    return persistence.get_routes_metadata()


@router.delete("/{route_id}")
async def delete_route(route_id: str):
    entry = persistence.find_route_meta(route_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Route video not found")

    filename = entry.get("filename")
    if filename:
        video_file = MEDIA_FOLDER / filename
        if video_file.exists():
            video_file.unlink()

    # Clean up cached route data
    cache_id = entry.get("cache_id")
    if cache_id:
        cache_file = ROUTES_CACHE / f"{cache_id}.json"
        cache_file.unlink(missing_ok=True)

    persistence.remove_route_meta(route_id)
    return {"ok": True}


    @router.post("/save-live")
    async def save_live_route(body: LiveRouteSaveRequest):
        """Save a route for live Street View streaming — no video generation."""
        import uuid

        route_id = uuid.uuid4().hex[:12]

        # Interpolate waypoints and compute headings
        dense = geo.interpolate_waypoints(body.waypoints, spacing_m=body.spacing_m)
        total_km = geo.total_distance_km(dense)

        headings: list[float] = []
        for idx, wp in enumerate(dense):
            if idx < len(dense) - 1:
                h = geo.bearing(wp.lat, wp.lng, dense[idx + 1].lat, dense[idx + 1].lng)
            else:
                h = geo.bearing(dense[idx - 1].lat, dense[idx - 1].lng, wp.lat, wp.lng)
            headings.append(round(h, 1))

        waypoint_dicts = [{"lat": w.lat, "lng": w.lng} for w in body.waypoints]
        dense_dicts = [{"lat": w.lat, "lng": w.lng} for w in dense]

        entry = persistence.save_live_route(
            route_id=route_id,
            name=body.route_name,
            description=body.description,
            waypoints=waypoint_dicts,
            dense_waypoints=dense_dicts,
            headings=headings,
            spacing_m=body.spacing_m,
            total_km=total_km,
        )

        # Save the dense data to routes cache so regeneration can use it
        import json
        cache_file = ROUTES_CACHE / f"{route_id}.json"
        cache_file.write_text(json.dumps({
            "route_name": body.route_name,
            "description": body.description,
            "spacing_m": body.spacing_m,
            "original_waypoints": waypoint_dicts,
            "dense_waypoints": dense_dicts,
            "headings": headings,
        }, indent=2, ensure_ascii=False), encoding="utf-8")

        return {
            "route_id": route_id,
            "status": "saved",
            "total_frames": len(dense),
            "total_km": total_km,
            "distance_km": total_km,
            "duration_s": len(dense),
        }


    @router.get("/{route_id}/waypoints")
    async def get_route_waypoints(route_id: str):
        """Return dense waypoints with headings for live Street View playback."""
        entry = persistence.find_route_meta(route_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Route not found")

        return {
            "route_id": route_id,
            "waypoints": [
                {
                    "lat": w["lat"],
                    "lng": w["lng"],
                    "heading": entry.get("headings", [0] * len(entry.get("dense_waypoints", [])))[i]
                    if i < len(entry.get("headings", [])) else 0,
                }
                for i, w in enumerate(entry.get("dense_waypoints", []))
            ],
            "spacing_m": entry.get("spacing_m", 10.0),
            "distance_km": entry.get("distance_km", 0),
            "duration_s": entry.get("duration_s", 0),
        }


@router.post("/regenerate")
async def regenerate_route(body: RouteGenerateRequest):
    """Regenerate a video from a previously cached route."""
    if not body.cached_route_id:
        raise HTTPException(status_code=400, detail="cached_route_id is required for regeneration")

    cache_file = ROUTES_CACHE / f"{body.cached_route_id}.json"
    if not cache_file.exists():
        raise HTTPException(status_code=404, detail="Cached route not found")

    gen_id = uuid.uuid4().hex[:16]
    active_route_generations[gen_id] = {
        "status": "starting", "percent": 0, "name": body.route_name,
    }
    asyncio.get_event_loop().run_in_executor(
        None, streetview.run_route_generation, gen_id, body, active_route_generations,
    )

    return {"generation_id": gen_id, "status": "started"}


@router.get("/cache-info/{cache_id}")
async def cache_info(cache_id: str):
    """Get info about a cached route for the regeneration UI."""
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


@router.get("/progress")
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
"""Pydantic request/response models for the VeloSync backend."""

from typing import Optional

from pydantic import BaseModel


# ── YouTube / video download ────────────────────────────

class VideoRequest(BaseModel):
    url: str
    quality: Optional[str] = "1080p"


class DownloadResponse(BaseModel):
    download_id: str
    title: str = ""


# ── Street View route generation ────────────────────────

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


class LiveRouteSaveRequest(BaseModel):
    """Save a route for live Street View streaming — no video generation needed."""
    waypoints: list[Waypoint]
    route_name: str
    description: str = ""
    spacing_m: float = 10.0
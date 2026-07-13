"""Geo utilities: haversine distance, bearing, interpolation, distance calculation."""

import math

from backend.models.schemas import Waypoint


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance in km between two lat/lng points (Haversine formula)."""
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Bearing in degrees from point 1 to point 2 (0 = North, 90 = East)."""
    d_lng = math.radians(lng2 - lng1)
    y = math.sin(d_lng) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - math.sin(
        math.radians(lat1)
    ) * math.cos(math.radians(lat2)) * math.cos(d_lng)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def interpolate_waypoints(
    waypoints: list[Waypoint], spacing_m: float = 10.0
) -> list[Waypoint]:
    """Interpolate waypoints so consecutive points are ~spacing_m apart."""
    if len(waypoints) < 2:
        return waypoints

    result: list[Waypoint] = [waypoints[0]]
    for i in range(len(waypoints) - 1):
        a = waypoints[i]
        b = waypoints[i + 1]
        seg_dist_m = haversine_km(a.lat, a.lng, b.lat, b.lng) * 1000
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


def total_distance_km(waypoints: list[Waypoint]) -> float:
    """Total Haversine distance across all waypoints, in km."""
    total = 0.0
    for i in range(len(waypoints) - 1):
        total += haversine_km(
            waypoints[i].lat,
            waypoints[i].lng,
            waypoints[i + 1].lat,
            waypoints[i + 1].lng,
        )
    return round(total, 2)
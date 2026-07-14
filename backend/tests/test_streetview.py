from pathlib import Path

from backend.models.schemas import Waypoint
from backend.services.streetview import (
    _ffmpeg_command,
    _frame_cache_key,
    _streetview_image_url,
)


def test_static_streetview_capture_is_fixed():
    waypoint = Waypoint(lat=45.1, lng=9.2)

    url = _streetview_image_url(waypoint, heading=42.25, api_key="test-key")

    assert "size=600x300" in url
    assert "fov=120" in url
    assert "heading=42.2" in url
    assert "key=test-key" in url
    assert "600x300_fov120" in _frame_cache_key(45.1, 9.2, 42.25)


def test_ffmpeg_pipeline_crops_to_16_9_before_scaling():
    command = _ffmpeg_command(Path("frames.txt"), Path("route.mp4"), frame_count=42)
    video_filter = command[command.index("-vf") + 1]

    assert "crop=trunc(ih*16/9/2)*2" in video_filter
    assert "scale=1280:720:flags=lanczos:in_range=full:out_range=tv" in video_filter
    assert "tpad=stop_mode=clone:stop_duration=1" in video_filter
    assert "minterpolate=fps=30:mi_mode=blend" in video_filter
    assert command[command.index("-t") + 1] == "42"
    assert command[command.index("-crf") + 1] == "18"
    assert "+faststart" in command

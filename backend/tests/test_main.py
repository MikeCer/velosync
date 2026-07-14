"""Tests for VeloSync backend API endpoints — now using the modular backend package."""

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "video_count" in data
    assert "media_folder" in data


def test_list_videos_empty():
    resp = client.get("/api/videos")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_info_invalid_url():
    resp = client.post("/api/info", json={"url": "not-a-valid-url"})
    assert resp.status_code == 422


def test_delete_nonexistent():
    resp = client.delete("/api/videos/nonexistent")
    assert resp.status_code == 404


def test_media_not_found():
    resp = client.get("/api/media/nonexistent.mp4")
    assert resp.status_code == 404


def test_download_queue():
    resp = client.get("/api/download/queue")
    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)


def test_route_list_empty():
    resp = client.get("/api/routes/list")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_unified_library():
    resp = client.get("/api/library")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

"""
Unit tests for the Internal ML API Gateway (Task-00029).
Tests routing, aggregate health, error translation, and timeouts with mocked downstreams.
"""

import os
import sys
from unittest.mock import patch

from fastapi.testclient import TestClient
import httpx
import pytest

# Ensure ml-gateway directory is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from server import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Health endpoint tests
# ---------------------------------------------------------------------------

def test_health_all_healthy(monkeypatch):
    async def mock_check(client, name, url):
        return "healthy"

    monkeypatch.setattr("server.check_service_health", mock_check)

    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["services"]["autoflip"] == "healthy"
    assert data["services"]["talknet"] == "healthy"


def test_health_autoflip_unhealthy(monkeypatch):
    async def mock_check(client, name, url):
        if name == "autoflip":
            return "unhealthy (connection error)"
        return "healthy"

    monkeypatch.setattr("server.check_service_health", mock_check)

    resp = client.get("/health")
    assert resp.status_code == 503
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["services"]["autoflip"] == "unhealthy (connection error)"
    assert data["services"]["talknet"] == "healthy"


def test_health_talknet_unhealthy(monkeypatch):
    async def mock_check(client, name, url):
        if name == "talknet":
            return "unhealthy (timeout)"
        return "healthy"

    monkeypatch.setattr("server.check_service_health", mock_check)

    resp = client.get("/health")
    assert resp.status_code == 503
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["services"]["autoflip"] == "healthy"
    assert data["services"]["talknet"] == "unhealthy (timeout)"


def test_health_both_down(monkeypatch):
    async def mock_check(client, name, url):
        return "unhealthy (connection error)"

    monkeypatch.setattr("server.check_service_health", mock_check)

    resp = client.get("/health")
    assert resp.status_code == 503
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["services"]["autoflip"] == "unhealthy (connection error)"
    assert data["services"]["talknet"] == "unhealthy (connection error)"


def test_health_talknet_degraded(monkeypatch):
    async def mock_check(client, name, url):
        if name == "talknet":
            return "degraded"
        return "healthy"

    monkeypatch.setattr("server.check_service_health", mock_check)

    resp = client.get("/health")
    assert resp.status_code == 503
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["services"]["autoflip"] == "healthy"
    assert data["services"]["talknet"] == "degraded"


@pytest.mark.asyncio
async def test_check_service_health_status_semantics():
    from server import check_service_health

    # downstream 200 + {"status": "ok"} -> healthy
    async def handler_ok(request):
        return httpx.Response(200, json={"status": "ok"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_ok)) as cl:
        res = await check_service_health(cl, "autoflip", "http://test:8000")
        assert res == "healthy"

    # downstream 200 + {"status": "degraded"} -> degraded
    async def handler_degraded(request):
        return httpx.Response(200, json={"status": "degraded", "weights": {"model": False}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_degraded)) as cl:
        res = await check_service_health(cl, "talknet", "http://test:8000")
        assert res == "degraded"

    # downstream 200 + {"status": "unhealthy"} -> unhealthy (unhealthy)
    async def handler_unhealthy(request):
        return httpx.Response(200, json={"status": "unhealthy"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_unhealthy)) as cl:
        res = await check_service_health(cl, "talknet", "http://test:8000")
        assert res == "unhealthy (unhealthy)"

    # downstream 200 + missing/malformed status -> healthy (preserve safe fallback)
    async def handler_missing(request):
        return httpx.Response(200, json={"other": "value"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_missing)) as cl:
        res = await check_service_health(cl, "talknet", "http://test:8000")
        assert res == "healthy"


# ---------------------------------------------------------------------------
# /reframe proxy tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reframe_success(monkeypatch):
    fake_crop_targets = {
        "ok": True,
        "crop_targets": {
            "schema_version": "1.0",
            "crop_window": {"target_width": 720, "target_height": 1280},
            "tracks": [],
        },
    }

    def mock_handler(request: httpx.Request):
        assert request.url.path == "/reframe"
        return httpx.Response(200, json=fake_crop_targets)

    mock_transport = httpx.MockTransport(mock_handler)
    orig_async_client = httpx.AsyncClient

    def custom_client(*args, **kwargs):
        kwargs["transport"] = mock_transport
        return orig_async_client(*args, **kwargs)

    monkeypatch.setattr("httpx.AsyncClient", custom_client)

    payload = {"videoUrl": "https://example.com/video.mp4", "targetAspectRatio": "9:16"}
    resp = client.post("/reframe", json=payload)
    assert resp.status_code == 200
    assert resp.json() == fake_crop_targets


@pytest.mark.asyncio
async def test_reframe_timeout(monkeypatch):
    def mock_handler(request: httpx.Request):
        raise httpx.TimeoutException("Downstream timeout")

    mock_transport = httpx.MockTransport(mock_handler)
    orig_async_client = httpx.AsyncClient

    def custom_client(*args, **kwargs):
        kwargs["transport"] = mock_transport
        return orig_async_client(*args, **kwargs)

    monkeypatch.setattr("httpx.AsyncClient", custom_client)

    resp = client.post("/reframe", json={"videoUrl": "https://example.com/video.mp4"})
    assert resp.status_code == 504
    data = resp.json()
    assert data["ok"] is False
    assert "timed out" in data["error"]


@pytest.mark.asyncio
async def test_reframe_connection_failure(monkeypatch):
    def mock_handler(request: httpx.Request):
        raise httpx.ConnectError("Connection refused")

    mock_transport = httpx.MockTransport(mock_handler)
    orig_async_client = httpx.AsyncClient

    def custom_client(*args, **kwargs):
        kwargs["transport"] = mock_transport
        return orig_async_client(*args, **kwargs)

    monkeypatch.setattr("httpx.AsyncClient", custom_client)

    resp = client.post("/reframe", json={"videoUrl": "https://example.com/video.mp4"})
    assert resp.status_code == 502
    data = resp.json()
    assert data["ok"] is False
    assert "unavailable" in data["error"]


@pytest.mark.asyncio
async def test_reframe_downstream_error_forwarded(monkeypatch):
    def mock_handler(request: httpx.Request):
        return httpx.Response(400, json={"ok": False, "error": "Invalid aspect ratio"})

    mock_transport = httpx.MockTransport(mock_handler)
    orig_async_client = httpx.AsyncClient

    def custom_client(*args, **kwargs):
        kwargs["transport"] = mock_transport
        return orig_async_client(*args, **kwargs)

    monkeypatch.setattr("httpx.AsyncClient", custom_client)

    resp = client.post("/reframe", json={"videoUrl": "https://example.com/video.mp4", "targetAspectRatio": "invalid"})
    assert resp.status_code == 400
    assert resp.json()["ok"] is False
    assert resp.json()["error"] == "Invalid aspect ratio"


@pytest.mark.asyncio
async def test_reframe_malformed_downstream_response(monkeypatch):
    def mock_handler(request: httpx.Request):
        return httpx.Response(200, content=b"Not valid JSON")

    mock_transport = httpx.MockTransport(mock_handler)
    orig_async_client = httpx.AsyncClient

    def custom_client(*args, **kwargs):
        kwargs["transport"] = mock_transport
        return orig_async_client(*args, **kwargs)

    monkeypatch.setattr("httpx.AsyncClient", custom_client)

    resp = client.post("/reframe", json={"videoUrl": "https://example.com/video.mp4"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is False
    assert "Malformed response" in resp.json()["error"]


# ---------------------------------------------------------------------------
# /talknet proxy tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_talknet_success(monkeypatch):
    fake_talknet_resp = {
        "ok": True,
        "video_info": {"fps": 25.0, "duration_sec": 4.0},
        "speakers": [
            {
                "track_id": "00000",
                "start_time_sec": 0.0,
                "end_time_sec": 4.0,
                "average_confidence": 0.9,
                "frames": [],
            }
        ],
    }

    def mock_handler(request: httpx.Request):
        assert request.url.path == "/detect"
        return httpx.Response(200, json=fake_talknet_resp)

    mock_transport = httpx.MockTransport(mock_handler)
    orig_async_client = httpx.AsyncClient

    def custom_client(*args, **kwargs):
        kwargs["transport"] = mock_transport
        return orig_async_client(*args, **kwargs)

    monkeypatch.setattr("httpx.AsyncClient", custom_client)

    resp = client.post("/talknet", json={"videoUrl": "https://example.com/video.mp4"})
    assert resp.status_code == 200
    assert resp.json() == fake_talknet_resp


@pytest.mark.asyncio
async def test_talknet_timeout(monkeypatch):
    def mock_handler(request: httpx.Request):
        raise httpx.TimeoutException("Downstream timeout")

    mock_transport = httpx.MockTransport(mock_handler)
    orig_async_client = httpx.AsyncClient

    def custom_client(*args, **kwargs):
        kwargs["transport"] = mock_transport
        return orig_async_client(*args, **kwargs)

    monkeypatch.setattr("httpx.AsyncClient", custom_client)

    resp = client.post("/talknet", json={"videoUrl": "https://example.com/video.mp4"})
    assert resp.status_code == 504
    data = resp.json()
    assert data["ok"] is False
    assert "timed out" in data["error"]


@pytest.mark.asyncio
async def test_talknet_connection_failure(monkeypatch):
    def mock_handler(request: httpx.Request):
        raise httpx.ConnectError("Connection refused")

    mock_transport = httpx.MockTransport(mock_handler)
    orig_async_client = httpx.AsyncClient

    def custom_client(*args, **kwargs):
        kwargs["transport"] = mock_transport
        return orig_async_client(*args, **kwargs)

    monkeypatch.setattr("httpx.AsyncClient", custom_client)

    resp = client.post("/talknet", json={"videoUrl": "https://example.com/video.mp4"})
    assert resp.status_code == 502
    data = resp.json()
    assert data["ok"] is False
    assert "unavailable" in data["error"]


@pytest.mark.asyncio
async def test_talknet_downstream_error_forwarded(monkeypatch):
    def mock_handler(request: httpx.Request):
        return httpx.Response(503, json={"ok": False, "error": "Model weights missing"})

    mock_transport = httpx.MockTransport(mock_handler)
    orig_async_client = httpx.AsyncClient

    def custom_client(*args, **kwargs):
        kwargs["transport"] = mock_transport
        return orig_async_client(*args, **kwargs)

    monkeypatch.setattr("httpx.AsyncClient", custom_client)

    resp = client.post("/talknet", json={"videoUrl": "https://example.com/video.mp4"})
    assert resp.status_code == 503
    assert resp.json()["ok"] is False
    assert resp.json()["error"] == "Model weights missing"


@pytest.mark.asyncio
async def test_talknet_malformed_downstream_response(monkeypatch):
    def mock_handler(request: httpx.Request):
        return httpx.Response(200, content=b"Server error not JSON")

    mock_transport = httpx.MockTransport(mock_handler)
    orig_async_client = httpx.AsyncClient

    def custom_client(*args, **kwargs):
        kwargs["transport"] = mock_transport
        return orig_async_client(*args, **kwargs)

    monkeypatch.setattr("httpx.AsyncClient", custom_client)

    resp = client.post("/talknet", json={"videoUrl": "https://example.com/video.mp4"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is False
    assert "Malformed response" in resp.json()["error"]

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
    """Test A: Both healthy -> HTTP 200, status ok, both ready."""
    async def mock_check(client, name, url):
        return "healthy"

    monkeypatch.setattr("server.check_service_health", mock_check)

    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["services"]["autoflip"] == "healthy"
    assert data["services"]["talknet"] == "healthy"
    assert data["ready"]["reframe"] is True
    assert data["ready"]["talknet"] is True


def test_health_autoflip_healthy_talknet_unhealthy(monkeypatch):
    """Test B: AutoFlip healthy + TalkNet unhealthy -> HTTP 200, status degraded, reframe ready, talknet not ready."""
    async def mock_check(client, name, url):
        if name == "talknet":
            return "unhealthy (timeout)"
        return "healthy"

    monkeypatch.setattr("server.check_service_health", mock_check)

    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["services"]["autoflip"] == "healthy"
    assert data["services"]["talknet"] == "unhealthy (timeout)"
    assert data["ready"]["reframe"] is True
    assert data["ready"]["talknet"] is False


def test_health_autoflip_healthy_talknet_degraded(monkeypatch):
    """Test C: AutoFlip healthy + TalkNet degraded -> HTTP 200, status degraded, reframe ready, talknet not ready."""
    async def mock_check(client, name, url):
        if name == "talknet":
            return "degraded"
        return "healthy"

    monkeypatch.setattr("server.check_service_health", mock_check)

    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["services"]["autoflip"] == "healthy"
    assert data["services"]["talknet"] == "degraded"
    assert data["ready"]["reframe"] is True
    assert data["ready"]["talknet"] is False


def test_health_autoflip_unhealthy_talknet_healthy(monkeypatch):
    """Test D: AutoFlip unhealthy + TalkNet healthy -> HTTP 503, status degraded, reframe false, talknet true."""
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
    assert data["ready"]["reframe"] is False
    assert data["ready"]["talknet"] is True


def test_health_both_unhealthy(monkeypatch):
    """Test E: Both unhealthy -> HTTP 503, both readiness flags false."""
    async def mock_check(client, name, url):
        return "unhealthy (connection error)"

    monkeypatch.setattr("server.check_service_health", mock_check)

    resp = client.get("/health")
    assert resp.status_code == 503
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["services"]["autoflip"] == "unhealthy (connection error)"
    assert data["services"]["talknet"] == "unhealthy (connection error)"
    assert data["ready"]["reframe"] is False
    assert data["ready"]["talknet"] is False


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

    # downstream 200 + {"status": "error"} -> unhealthy (error)
    async def handler_error(request):
        return httpx.Response(200, json={"status": "error"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_error)) as cl:
        res = await check_service_health(cl, "talknet", "http://test:8000")
        assert res == "unhealthy (error)"

    # Test F: Downstream health payload missing "status" -> unhealthy (invalid response)
    async def handler_missing(request):
        return httpx.Response(200, json={"other": "value"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_missing)) as cl:
        res = await check_service_health(cl, "talknet", "http://test:8000")
        assert res == "unhealthy (invalid response)"

    # Test G: Downstream health payload contains unknown status -> unhealthy (invalid response)
    async def handler_unknown(request):
        return httpx.Response(200, json={"status": "ready"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_unknown)) as cl:
        res = await check_service_health(cl, "talknet", "http://test:8000")
        assert res == "unhealthy (invalid response)"

    # Test H: Downstream health response is malformed JSON -> unhealthy (invalid response)
    async def handler_malformed(request):
        return httpx.Response(200, content=b"{not valid json")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_malformed)) as cl:
        res = await check_service_health(cl, "autoflip", "http://test:8000")
        assert res == "unhealthy (invalid response)"

    # Test I: Downstream health response is valid JSON but not an object -> unhealthy (invalid response)
    async def handler_non_object(request):
        return httpx.Response(200, json=["status", "ok"])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_non_object)) as cl:
        res = await check_service_health(cl, "autoflip", "http://test:8000")
        assert res == "unhealthy (invalid response)"

    # Non-200 HTTP response -> preserve unhealthy (status N)
    async def handler_500(request):
        return httpx.Response(500, json={"status": "internal server error"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_500)) as cl:
        res = await check_service_health(cl, "autoflip", "http://test:8000")
        assert res == "unhealthy (status 500)"

    # Timeout -> preserve unhealthy (timeout)
    async def handler_timeout(request):
        raise httpx.TimeoutException("Downstream timeout")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_timeout)) as cl:
        res = await check_service_health(cl, "autoflip", "http://test:8000")
        assert res == "unhealthy (timeout)"

    # Connection error -> preserve unhealthy (connection error)
    async def handler_conn_err(request):
        raise httpx.ConnectError("Connection refused")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_conn_err)) as cl:
        res = await check_service_health(cl, "autoflip", "http://test:8000")
        assert res == "unhealthy (connection error)"


@pytest.mark.asyncio
async def test_downstream_health_payload_missing_status():
    """Test F: Downstream health payload missing 'status' -> unhealthy (invalid response)."""
    from server import check_service_health

    async def handler(request):
        return httpx.Response(200, json={"foo": "bar"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cl:
        res = await check_service_health(cl, "autoflip", "http://test:8000")
        assert res == "unhealthy (invalid response)"


@pytest.mark.asyncio
async def test_downstream_health_payload_unknown_status():
    """Test G: Downstream health payload contains unknown status -> unhealthy (invalid response)."""
    from server import check_service_health

    async def handler(request):
        return httpx.Response(200, json={"status": "unknown_state"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cl:
        res = await check_service_health(cl, "talknet", "http://test:8000")
        assert res == "unhealthy (invalid response)"


@pytest.mark.asyncio
async def test_downstream_health_malformed_json():
    """Test H: Downstream health response is malformed JSON -> unhealthy (invalid response)."""
    from server import check_service_health

    async def handler(request):
        return httpx.Response(200, content=b"<not-json>")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cl:
        res = await check_service_health(cl, "autoflip", "http://test:8000")
        assert res == "unhealthy (invalid response)"


@pytest.mark.asyncio
async def test_downstream_health_non_object_json():
    """Test I: Downstream health response is valid JSON but not an object -> unhealthy (invalid response)."""
    from server import check_service_health

    async def handler(request):
        return httpx.Response(200, json=["status", "ok"])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cl:
        res = await check_service_health(cl, "talknet", "http://test:8000")
        assert res == "unhealthy (invalid response)"


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

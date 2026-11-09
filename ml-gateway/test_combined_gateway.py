import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml-gateway"))

import server
from fastapi.testclient import TestClient

client = TestClient(server.app)


class FakeResponse:
    def __init__(self, status_code, data):
        self.status_code = status_code
        self._data = data

    def json(self):
        return self._data


class FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def post(self, url, json=None):
        if url.endswith("/reframe"):
            return FakeResponse(200, {
                "ok": True,
                "crop_targets": {
                    "schema_version": 1,
                    "source": {"width": 1280, "height": 720, "fps": 24},
                    "output": {"aspect_ratio": "9:16"},
                    "crop_targets": [{
                        "timestamp_sec": 1.0,
                        "crop": {"x": 400, "y": 0, "width": 405, "height": 720}
                    }]
                }
            })
        if url.endswith("/detect"):
            return FakeResponse(200, {
                "ok": True,
                "speakers": [{
                    "track_id": "speaker-1",
                    "frames": [{
                        "timestamp_sec": 1.0,
                        "bbox": [100, 100, 200, 300],
                        "is_speaking": True
                    }]
                }]
            })
        return FakeResponse(500, {})


def test_combined_endpoint_fuses_results():
    with patch.object(server.httpx, "AsyncClient", FakeAsyncClient):
        response = client.post("/reframe-combined", json={
            "videoUrl": "https://example.com/video.mp4",
            "targetAspectRatio": "9:16"
        })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is True
    assert body["processing"]["autoflip"] is True
    assert body["processing"]["talknet"] is True
    fused = body["crop_targets"]
    assert isinstance(fused, dict)
    target = fused["crop_targets"][0]
    assert target["crop"]["x"] < 400, "Speaking-face detection did not adjust the crop"
    assert target["crop"]["width"] == 405
    assert target["crop"]["height"] == 720
    assert target["source"] == "speaker"


def test_combined_endpoint_requires_video_url():
    response = client.post("/reframe-combined", json={})
    assert response.status_code == 400


def test_combined_endpoint_handles_autoflip_failure():
    class AutoflipFailureClient(FakeAsyncClient):
        async def post(self, url, json=None):
            if url.endswith("/reframe"):
                return FakeResponse(500, {"error": "failed"})
            return FakeResponse(200, {"ok": True, "speakers": []})

    with patch.object(server.httpx, "AsyncClient", AutoflipFailureClient):
        response = client.post("/reframe-combined", json={
            "videoUrl": "https://example.com/video.mp4"
        })
    assert response.status_code == 500


def test_combined_endpoint_handles_talknet_failure():
    class TalkNetFailureClient(FakeAsyncClient):
        async def post(self, url, json=None):
            if url.endswith("/detect"):
                return FakeResponse(503, {"error": "unavailable"})
            return await super().post(url, json)

    with patch.object(server.httpx, "AsyncClient", TalkNetFailureClient):
        response = client.post("/reframe-combined", json={
            "videoUrl": "https://example.com/video.mp4"
        })
    assert response.status_code == 503


def test_combined_endpoint_rejects_invalid_autoflip_data():
    class InvalidDataClient(FakeAsyncClient):
        async def post(self, url, json=None):
            if url.endswith("/reframe"):
                return FakeResponse(200, {"ok": True, "crop_targets": []})
            return FakeResponse(200, {"ok": True, "speakers": []})

    with patch.object(server.httpx, "AsyncClient", InvalidDataClient):
        response = client.post("/reframe-combined", json={
            "videoUrl": "https://example.com/video.mp4"
        })
    assert response.status_code == 502

"""
Unit tests for the TalkNet Active Speaker Detection Service (Task-00029).
Executes without GPU or real model weights using mocks.
"""

import os
import shutil
import sys
import tempfile
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import numpy as np
import pytest

# Ensure talknet directory is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from server import app
from service import (
    DownloadError,
    ExecutionError,
    MissingWeightsError,
    TimeoutError,
    ValidationError,
    bb_intersection_over_union,
    check_deadline,
    check_weights_available,
    download_video,
    get_inference_device,
    process_detect,
    track_shot,
    validate_detect_request,
    validate_url_target,
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# Health endpoint tests
# ---------------------------------------------------------------------------

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "device" in data
    assert "cuda_available" in data
    assert "weights" in data
    assert isinstance(data["weights"], dict)


def test_health_reflects_weight_presence(tmp_path):
    s3fd_file = tmp_path / "sfd_face.pth"
    s3fd_file.write_text("fake-weights")
    model_file = tmp_path / "pretrain_TalkSet.model"
    model_file.write_text("fake-weights")

    status = check_weights_available(str(s3fd_file), str(model_file))
    assert status["s3fd"] is True
    assert status["model"] is True
    assert status["all_ready"] is True

    status_missing = check_weights_available(
        str(tmp_path / "missing1.pth"), str(tmp_path / "missing2.model")
    )
    assert status_missing["s3fd"] is False
    assert status_missing["model"] is False
    assert status_missing["all_ready"] is False


# ---------------------------------------------------------------------------
# Validation & SSRF tests
# ---------------------------------------------------------------------------

@patch("service.socket.getaddrinfo")
def test_validate_detect_request_valid(mock_dns):
    mock_dns.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
    validate_detect_request("https://example.com/video.mp4")
    validate_detect_request(
        "http://example.com/video.mp4", min_track_frames=5, confidence_threshold=0.5
    )


def test_validate_detect_request_file_scheme_rejected():
    with pytest.raises(ValidationError, match="http or https scheme"):
        validate_detect_request("file:///tmp/video.mp4")


def test_validate_detect_request_missing_or_empty_url():
    with pytest.raises(ValidationError, match="videoUrl is required"):
        validate_detect_request("")

    with pytest.raises(ValidationError, match="videoUrl is required"):
        validate_detect_request(None)

    with pytest.raises(ValidationError, match="videoUrl is required"):
        validate_detect_request("   ")


def test_validate_detect_request_invalid_scheme():
    with pytest.raises(ValidationError, match="http or https scheme"):
        validate_detect_request("ftp://example.com/video.mp4")

    with pytest.raises(ValidationError, match="http or https scheme"):
        validate_detect_request("data:video/mp4;base64,...")


def test_validate_detect_request_ssrf_blocked():
    # Cloud metadata
    with pytest.raises(ValidationError, match="host is not permitted"):
        validate_detect_request("http://169.254.169.254/latest/meta-data/")

    with pytest.raises(ValidationError, match="host is not permitted"):
        validate_detect_request("http://metadata.google.internal/computeMetadata/v1/")

    # Localhost and loopback
    with pytest.raises(ValidationError, match="host is not permitted"):
        validate_detect_request("http://localhost/video.mp4")

    with pytest.raises(ValidationError, match="host is not permitted"):
        validate_detect_request("http://app.localhost/video.mp4")

    with pytest.raises(ValidationError, match="host is not permitted"):
        validate_detect_request("http://127.0.0.1/video.mp4")

    # Private IPv4 ranges
    with pytest.raises(ValidationError, match="host is not permitted"):
        validate_detect_request("http://10.0.0.1/video.mp4")

    with pytest.raises(ValidationError, match="host is not permitted"):
        validate_detect_request("http://172.18.0.2/video.mp4")

    with pytest.raises(ValidationError, match="host is not permitted"):
        validate_detect_request("http://192.168.1.1/video.mp4")

    # Internal Docker services
    with pytest.raises(ValidationError, match="host is not permitted"):
        validate_detect_request("http://autoflip:8000/reframe")

    with pytest.raises(ValidationError, match="host is not permitted"):
        validate_detect_request("http://talknet:8000/detect")

    with pytest.raises(ValidationError, match="host is not permitted"):
        validate_detect_request("http://ml-gateway:8000/health")

    # Host resolving to private IP via DNS
    with patch("service.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("192.168.0.50", 0))]):
        with pytest.raises(ValidationError, match="non-permitted address"):
            validate_detect_request("http://internal-corp.example/video.mp4")


def test_validate_detect_request_invalid_min_track():
    with patch("service.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("93.184.216.34", 0))]):
        with pytest.raises(ValidationError, match="minTrackFrames must be an integer >= 1"):
            validate_detect_request("https://example.com/video.mp4", min_track_frames=0)

        with pytest.raises(ValidationError, match="minTrackFrames must be an integer >= 1"):
            validate_detect_request("https://example.com/video.mp4", min_track_frames="five")  # type: ignore


def test_validate_detect_request_invalid_threshold():
    with patch("service.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("93.184.216.34", 0))]):
        with pytest.raises(ValidationError, match="confidenceThreshold must be a number"):
            validate_detect_request("https://example.com/video.mp4", confidence_threshold="high")  # type: ignore


def test_post_detect_validation_error():
    res = client.post("/detect", json={"videoUrl": ""})
    assert res.status_code == 400
    assert res.json()["ok"] is False
    assert "videoUrl is required" in res.json()["error"]


# ---------------------------------------------------------------------------
# Download and Redirect tests
# ---------------------------------------------------------------------------

@patch("service.requests.get")
@patch("service.socket.getaddrinfo")
def test_download_failure_http_error(mock_dns, mock_get):
    mock_dns.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
    mock_resp = MagicMock()
    mock_resp.status_code = 404
    mock_get.return_value = mock_resp

    with patch("service.check_weights_available", return_value={"all_ready": True, "s3fd": True, "model": True}):
        with pytest.raises(DownloadError, match="HTTP status 404"):
            process_detect("https://example.com/notfound.mp4")


@patch("service.requests.get")
@patch("service.socket.getaddrinfo")
def test_download_timeout_error(mock_dns, mock_get):
    import requests
    mock_dns.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
    mock_get.side_effect = requests.Timeout("Connection timed out")

    with patch("service.check_weights_available", return_value={"all_ready": True, "s3fd": True, "model": True}):
        with pytest.raises(TimeoutError, match="timed out"):
            process_detect("https://example.com/slow.mp4")


@patch("service.requests.get")
@patch("service.socket.getaddrinfo")
def test_download_redirect_to_private_ip_blocked(mock_dns, mock_get):
    mock_dns.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
    mock_resp = MagicMock()
    mock_resp.status_code = 302
    mock_resp.headers = {"Location": "http://127.0.0.1/secret.mp4"}
    mock_get.return_value = mock_resp

    with pytest.raises(ValidationError, match="host is not permitted"):
        download_video("http://example.com/video.mp4", "/tmp/dest.mp4")


@patch("service.requests.get")
@patch("service.socket.getaddrinfo")
def test_download_safe_redirect(mock_dns, mock_get, tmp_path):
    mock_dns.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
    # Hop 1: 302 redirect to valid public location
    resp1 = MagicMock()
    resp1.status_code = 302
    resp1.headers = {"Location": "http://example.com/real_video.mp4"}

    # Hop 2: 200 with video content
    resp2 = MagicMock()
    resp2.status_code = 200
    resp2.iter_content.return_value = [b"chunk1", b"chunk2"]

    mock_get.side_effect = [resp1, resp2]
    dest = tmp_path / "out.mp4"
    download_video("http://example.com/video.mp4", str(dest))
    assert dest.read_bytes() == b"chunk1chunk2"


@patch("service.requests.get")
@patch("service.socket.getaddrinfo")
def test_download_too_many_redirects(mock_dns, mock_get):
    mock_dns.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
    resp = MagicMock()
    resp.status_code = 302
    resp.headers = {"Location": "http://example.com/loop.mp4"}
    mock_get.return_value = resp

    with pytest.raises(DownloadError, match="Too many redirects"):
        download_video("http://example.com/video.mp4", "/tmp/dest.mp4")


# ---------------------------------------------------------------------------
# Missing weights handling
# ---------------------------------------------------------------------------

@patch("service.socket.getaddrinfo")
def test_missing_weights_raises_503(mock_dns):
    mock_dns.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
    with patch("service.check_weights_available", return_value={"all_ready": False, "s3fd": False, "model": False}):
        res = client.post("/detect", json={"videoUrl": "https://example.com/video.mp4"})
        assert res.status_code == 503
        assert res.json()["ok"] is False
        assert "weights are not configured" in res.json()["error"]


# ---------------------------------------------------------------------------
# Face tracking & IOU logic
# ---------------------------------------------------------------------------

def test_bb_intersection_over_union():
    boxA = [0, 0, 10, 10]
    boxB = [0, 0, 10, 10]
    assert bb_intersection_over_union(boxA, boxB) == 1.0

    boxC = [10, 10, 20, 20]
    assert bb_intersection_over_union(boxA, boxC) == 0.0

    boxD = [5, 5, 15, 15]
    iou = bb_intersection_over_union(boxA, boxD)
    assert 0.14 < iou < 0.15


def test_track_shot_grouping():
    # 5 frames of detections with high overlap
    shot_dets = [
        [{"frame": 0, "bbox": [10.0, 10.0, 50.0, 50.0], "conf": 0.99}],
        [{"frame": 1, "bbox": [11.0, 10.0, 51.0, 50.0], "conf": 0.98}],
        [{"frame": 2, "bbox": [12.0, 11.0, 52.0, 51.0], "conf": 0.97}],
        [{"frame": 3, "bbox": [12.0, 11.0, 52.0, 51.0], "conf": 0.99}],
        [{"frame": 4, "bbox": [13.0, 12.0, 53.0, 52.0], "conf": 0.96}],
    ]
    tracks = track_shot(shot_dets, min_track=4, num_failed_det=2)
    assert len(tracks) == 1
    assert len(tracks[0]["frame"]) == 5
    assert tracks[0]["bbox"].shape == (5, 4)


# ---------------------------------------------------------------------------
# Output contract and mock pipeline tests
# ---------------------------------------------------------------------------

@patch("service.run_talknet_pipeline")
@patch("service.download_video")
@patch("service.check_weights_available")
@patch("service.socket.getaddrinfo")
def test_successful_detect_response_contract(mock_dns, mock_weights, mock_dl, mock_pipe):
    mock_dns.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
    mock_weights.return_value = {"all_ready": True, "s3fd": True, "model": True}
    mock_dl.return_value = None
    mock_pipe.return_value = {
        "ok": True,
        "video_info": {"fps": 25.0, "duration_sec": 4.0},
        "speakers": [
            {
                "track_id": "00000",
                "start_time_sec": 0.0,
                "end_time_sec": 4.0,
                "average_confidence": 0.85,
                "frames": [
                    {
                        "frame": 0,
                        "timestamp_sec": 0.0,
                        "bbox": [100.0, 50.0, 200.0, 150.0],
                        "speaking_score": 1.2,
                        "is_speaking": True,
                    }
                ],
            }
        ],
    }

    res = client.post(
        "/detect",
        json={"videoUrl": "https://example.com/demo.mp4", "minTrackFrames": 5},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["video_info"]["fps"] == 25.0
    assert len(data["speakers"]) == 1
    speaker = data["speakers"][0]
    assert speaker["track_id"] == "00000"
    assert speaker["average_confidence"] == 0.85
    assert len(speaker["frames"]) == 1
    assert speaker["frames"][0]["is_speaking"] is True


# ---------------------------------------------------------------------------
# Tempdir cleanup guarantee
# ---------------------------------------------------------------------------

@patch("service.download_video")
@patch("service.check_weights_available")
@patch("service.socket.getaddrinfo")
def test_temp_directory_cleaned_up_on_failure(mock_dns, mock_weights, mock_dl):
    mock_dns.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
    mock_weights.return_value = {"all_ready": True, "s3fd": True, "model": True}
    created_dirs = []

    orig_mkdtemp = tempfile.mkdtemp

    def tracked_mkdtemp(*args, **kwargs):
        d = orig_mkdtemp(*args, **kwargs)
        created_dirs.append(d)
        return d

    with patch("tempfile.mkdtemp", side_effect=tracked_mkdtemp):
        mock_dl.side_effect = RuntimeError("Simulated unhandled download crash")
        with pytest.raises(ExecutionError):
            process_detect("https://example.com/crash.mp4")

    assert len(created_dirs) == 1
    # Verify that the created temporary directory was deleted in finally
    assert not os.path.exists(created_dirs[0])


# ---------------------------------------------------------------------------
# Pipeline Timeout tests
# ---------------------------------------------------------------------------

def test_check_deadline_raises_timeout_error():
    import time
    from service import check_deadline, TimeoutError

    past_deadline = time.monotonic() - 1.0
    with pytest.raises(TimeoutError, match="timed out"):
        check_deadline(past_deadline, 150, "test-stage")


@patch("service.download_video")
@patch("service.check_weights_available")
@patch("service.subprocess.run")
@patch("service.socket.getaddrinfo")
def test_process_detect_pipeline_timeout_expired(
    mock_dns, mock_sub, mock_weights, mock_dl
):
    import subprocess
    mock_dns.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
    mock_weights.return_value = {"all_ready": True, "s3fd": True, "model": True}
    mock_dl.return_value = None
    mock_sub.side_effect = subprocess.TimeoutExpired(cmd=["ffmpeg"], timeout=5.0)

    with pytest.raises(TimeoutError, match="TalkNet execution timed out"):
        process_detect("https://example.com/video.mp4", timeout_sec=5)


@patch("service.download_video")
@patch("service.check_weights_available")
@patch("service.socket.getaddrinfo")
def test_post_detect_timeout_returns_504(mock_dns, mock_weights, mock_dl):
    mock_dns.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
    mock_weights.return_value = {"all_ready": True, "s3fd": True, "model": True}
    mock_dl.return_value = None

    with patch(
        "service.run_talknet_pipeline",
        side_effect=TimeoutError("TalkNet execution timed out after 5s"),
    ):
        res = client.post("/detect", json={"videoUrl": "https://example.com/video.mp4"})
        assert res.status_code == 504
        assert res.json()["ok"] is False
        assert "timed out" in res.json()["error"]

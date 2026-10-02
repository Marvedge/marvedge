"""
Unit tests for AutoFlip ML inference service (Task-00023).
Tests request validation, subprocess invocation, error handling, timeouts,
and directory cleanup using mocked execution boundaries.
"""

import json
import os
import socket
import subprocess
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from server import app
from service import (
    DownloadError,
    ExecutionError,
    TimeoutError,
    ValidationError,
    download_video,
    parse_and_validate_json_output,
    process_reframe,
    run_autoflip_subprocess,
    validate_reframe_request,
)

SAMPLE_CROP_TARGET_DATA = {
    "schema_version": 1,
    "source": {
        "width": 1920,
        "height": 1080,
        "fps": 30.0,
        "duration_sec": 5.0,
    },
    "output": {"aspect_ratio": "9:16"},
    "timeline": {
        "timebase": "seconds",
        "sampling": "keyframes_interpolated",
    },
    "crop_targets": [
        {
            "timestamp_sec": 0.0,
            "frame": 0,
            "crop": {"x": 420.0, "y": 0.0, "width": 1080.0, "height": 1920.0},
            "source": "autoflip",
        }
    ],
}


@pytest.fixture
def client():
    return TestClient(app)


class TestValidation:
    def test_valid_requests(self):
        validate_reframe_request("https://example.com/video.mp4", "9:16")
        validate_reframe_request("http://example.com/video.mp4", "1:1")

    def test_missing_or_empty_video_url(self):
        with pytest.raises(ValidationError, match="videoUrl is required"):
            validate_reframe_request("", "9:16")

        with pytest.raises(ValidationError, match="videoUrl is required"):
            validate_reframe_request(None, "9:16")

    def test_invalid_video_url_scheme(self):
        with pytest.raises(ValidationError, match="valid HTTP or HTTPS URL"):
            validate_reframe_request("ftp://example.com/video.mp4", "9:16")

        with pytest.raises(ValidationError, match="must use HTTP or HTTPS"):
            validate_reframe_request("file:///tmp/local.mp4", "9:16")

    def test_missing_or_invalid_aspect_ratio(self):
        with pytest.raises(ValidationError, match="targetAspectRatio is required"):
            validate_reframe_request("https://example.com/video.mp4", "")

        with pytest.raises(ValidationError, match="invalid; expected format"):
            validate_reframe_request("https://example.com/video.mp4", "portrait")

        with pytest.raises(ValidationError, match="invalid; expected format"):
            validate_reframe_request("https://example.com/video.mp4", "9x16")


class TestVideoDownload:
    @patch("requests.get")
    def test_download_success(self, mock_get, tmp_path):
        mock_resp = MagicMock()
        mock_resp.iter_content.return_value = [b"mock_video_bytes"]
        mock_resp.raise_for_status = MagicMock()
        mock_resp.__enter__.return_value = mock_resp
        mock_resp.is_redirect = False
        mock_resp.is_permanent_redirect = False
        mock_resp.headers = {}
        mock_get.return_value = mock_resp

        dest = os.path.join(tmp_path, "out.mp4")
        download_video("https://example.com/video.mp4", dest)

        assert os.path.isfile(dest)
        with open(dest, "rb") as f:
            assert f.read() == b"mock_video_bytes"

    @patch("requests.get")
    def test_download_failure(self, mock_get, tmp_path):
        import requests

        mock_get.side_effect = requests.exceptions.HTTPError("404 Not Found")
        dest = os.path.join(tmp_path, "out.mp4")

        with pytest.raises(DownloadError, match="Failed to download video"):
            download_video("https://example.com/notfound.mp4", dest)

    @patch("requests.get")
    def test_download_timeout(self, mock_get, tmp_path):
        import requests

        mock_get.side_effect = requests.exceptions.Timeout("Connection timed out")
        dest = os.path.join(tmp_path, "out.mp4")

        with pytest.raises(DownloadError, match="timed out"):
            download_video("https://example.com/slow.mp4", dest, timeout_sec=2)
    def test_download_rejects_private_ip(self, tmp_path):
        dest = os.path.join(tmp_path, "out.mp4")

        with pytest.raises(
            ValidationError,
            match="private or internal network address",
        ):
            download_video("http://127.0.0.1/video.mp4", dest)

    def test_download_rejects_localhost(self, tmp_path):
        dest = os.path.join(tmp_path, "out.mp4")

        with pytest.raises(
            ValidationError,
            match="private or internal network address",
        ):
            download_video("http://localhost/video.mp4", dest)

    def test_download_rejects_file_url(self, tmp_path):
        dest = os.path.join(tmp_path, "out.mp4")

        with pytest.raises(ValidationError, match="must use HTTP or HTTPS"):
            download_video("file:///tmp/video.mp4", dest)

    @patch("requests.get")
    def test_download_rejects_redirect_to_private_ip(self, mock_get, tmp_path):
        mock_resp = MagicMock()
        mock_resp.is_redirect = True
        mock_resp.is_permanent_redirect = False
        mock_resp.headers = {
            "Location": "http://127.0.0.1/internal-video.mp4"
        }
        mock_resp.__enter__.return_value = mock_resp
        mock_get.return_value = mock_resp

        dest = os.path.join(tmp_path, "out.mp4")

        with pytest.raises(
            ValidationError,
            match="private or internal network address",
        ):
            download_video("https://example.com/video.mp4", dest)

    @patch("service.socket.getaddrinfo")
    def test_download_rejects_hostname_resolving_to_private_ip(
        self, mock_getaddrinfo, tmp_path
    ):
        mock_getaddrinfo.return_value = [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                6,
                "",
                ("10.0.0.5", 80),
            )
        ]

        dest = os.path.join(tmp_path, "out.mp4")

        with pytest.raises(
            ValidationError,
            match="private or internal network address",
        ):
            download_video("https://example.com/video.mp4", dest)


class TestAutoFlipExecution:
    @patch("os.path.isfile", return_value=True)
    @patch("subprocess.run")
    def test_execution_success(self, mock_run, mock_isfile):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        run_autoflip_subprocess(
            binary_path="/usr/local/bin/run_autoflip_to_json",
            graph_path="/graph.pbtxt",
            input_video_path="/tmp/in.mp4",
            output_json_path="/tmp/out.json",
            aspect_ratio="9:16",
        )

        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]
        assert cmd[0] == "/usr/local/bin/run_autoflip_to_json"
        assert "--input_video_path=/tmp/in.mp4" in cmd
        assert "--output_json_path=/tmp/out.json" in cmd
        assert "--aspect_ratio=9:16" in cmd

    @patch("os.path.isfile", return_value=True)
    @patch("subprocess.run")
    def test_execution_failure_exit_code(self, mock_run, mock_isfile):
        mock_run.return_value = MagicMock(
            returncode=139,
            stdout="",
            stderr="Segmentation fault (core dumped)",
        )

        with pytest.raises(ExecutionError, match="exit code 139"):
            run_autoflip_subprocess(
                binary_path="/bin/run",
                graph_path="/graph.pbtxt",
                input_video_path="/tmp/in.mp4",
                output_json_path="/tmp/out.json",
                aspect_ratio="9:16",
            )

    @patch("os.path.isfile", return_value=True)
    @patch("subprocess.run")
    def test_execution_timeout(self, mock_run, mock_isfile):
        mock_run.side_effect = subprocess.TimeoutExpired(
            cmd=["run_autoflip"], timeout=150
        )

        with pytest.raises(TimeoutError, match="timed out after 150 seconds"):
            run_autoflip_subprocess(
                binary_path="/bin/run",
                graph_path="/graph.pbtxt",
                input_video_path="/tmp/in.mp4",
                output_json_path="/tmp/out.json",
                aspect_ratio="9:16",
                timeout_sec=150,
            )


class TestJsonParsing:
    def test_valid_json(self, tmp_path):
        json_path = os.path.join(tmp_path, "out.json")
        with open(json_path, "w") as f:
            json.dump(SAMPLE_CROP_TARGET_DATA, f)

        data = parse_and_validate_json_output(json_path)
        assert data["schema_version"] == 1
        assert len(data["crop_targets"]) == 1

    def test_missing_json(self, tmp_path):
        json_path = os.path.join(tmp_path, "nonexistent.json")
        with pytest.raises(ExecutionError, match="was not produced"):
            parse_and_validate_json_output(json_path)

    def test_empty_json(self, tmp_path):
        json_path = os.path.join(tmp_path, "empty.json")
        with open(json_path, "w") as f:
            f.write("")

        with pytest.raises(ExecutionError, match="is empty"):
            parse_and_validate_json_output(json_path)

    def test_malformed_json(self, tmp_path):
        json_path = os.path.join(tmp_path, "malformed.json")
        with open(json_path, "w") as f:
            f.write("{ invalid json: ")

        with pytest.raises(ExecutionError, match="malformed JSON"):
            parse_and_validate_json_output(json_path)


class TestCleanupAndEndToEnd:
    @patch("service.download_video")
    @patch("service.run_autoflip_subprocess")
    def test_process_reframe_cleanup_on_success(
        self, mock_run, mock_dl, tmp_path
    ):
        temp_dirs_created = []

        def side_effect_run(
            binary_path, graph_path, input_video_path, output_json_path, aspect_ratio, timeout_sec
        ):
            temp_dirs_created.append(os.path.dirname(output_json_path))
            with open(output_json_path, "w") as f:
                json.dump(SAMPLE_CROP_TARGET_DATA, f)

        mock_run.side_effect = side_effect_run

        with patch("os.path.isfile", return_value=True):
            result = process_reframe(
                video_url="https://example.com/test.mp4",
                target_aspect_ratio="9:16",
                binary_path="/mock/bin",
                graph_path="/mock/graph.pbtxt",
            )

        assert result["ok"] is True
        assert result["crop_targets"] == SAMPLE_CROP_TARGET_DATA

        # Ensure temporary directory was cleaned up
        assert len(temp_dirs_created) == 1
        assert not os.path.exists(temp_dirs_created[0])

    @patch("service.download_video")
    @patch("service.run_autoflip_subprocess")
    def test_process_reframe_cleanup_on_failure(
        self, mock_run, mock_dl, tmp_path
    ):
        temp_dirs_created = []

        def side_effect_run(
            binary_path, graph_path, input_video_path, output_json_path, aspect_ratio, timeout_sec
        ):
            temp_dirs_created.append(os.path.dirname(output_json_path))
            raise ExecutionError("AutoFlip crashed")

        mock_run.side_effect = side_effect_run

        with patch("os.path.isfile", return_value=True):
            with pytest.raises(ExecutionError, match="AutoFlip crashed"):
                process_reframe(
                    video_url="https://example.com/test.mp4",
                    target_aspect_ratio="9:16",
                    binary_path="/mock/bin",
                    graph_path="/mock/graph.pbtxt",
                )

        assert len(temp_dirs_created) == 1
        assert not os.path.exists(temp_dirs_created[0])


class TestHttpServerEndpoints:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_post_reframe_validation_error(self, client):
        resp = client.post("/reframe", json={"videoUrl": "", "targetAspectRatio": "9:16"})
        assert resp.status_code == 400
        data = resp.json()
        assert data["ok"] is False
        assert "videoUrl is required" in data["error"]

    def test_post_reframe_aspect_ratio_error(self, client):
        resp = client.post(
            "/reframe",
            json={"videoUrl": "https://example.com/v.mp4", "targetAspectRatio": "invalid"},
        )
        assert resp.status_code == 400
        data = resp.json()
        assert data["ok"] is False
        assert "invalid" in data["error"]

    @patch("server.process_reframe")
    def test_post_reframe_success(self, mock_process, client):
        mock_process.return_value = {
            "ok": True,
            "crop_targets": SAMPLE_CROP_TARGET_DATA,
        }

        resp = client.post(
            "/reframe",
            json={"videoUrl": "https://example.com/v.mp4", "targetAspectRatio": "9:16"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["crop_targets"] == SAMPLE_CROP_TARGET_DATA

    @patch("server.process_reframe")
    def test_post_reframe_timeout_504(self, mock_process, client):
        mock_process.side_effect = TimeoutError("AutoFlip analysis timed out after 150 seconds")

        resp = client.post(
            "/reframe",
            json={"videoUrl": "https://example.com/v.mp4", "targetAspectRatio": "9:16"},
        )
        assert resp.status_code == 504
        data = resp.json()
        assert data["ok"] is False
        assert "timed out" in data["error"]

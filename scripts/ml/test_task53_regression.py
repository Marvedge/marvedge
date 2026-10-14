"""
scripts/ml/test_task53_regression.py
------------------------------------
Focused unit tests for TASK-00053 regression harness (task53_regression.py).

Tests:
1. Path normalization (Git Bash / MSYS to Windows drive format)
2. Fraction / FPS parsing
3. Media metadata extraction and classification (video_with_audio, silent_video, corrupt, missing)
4. CropTargetData schema and boundary validation (schema_version 1, timestamps, bounds, negatives)
5. Crop trajectory stability metrics (empty, single-frame, steady motion, sudden jumps, zero dt guard)
6. Output media validation (portrait orientation, aspect ratio drift, audio preservation)
7. FFmpeg crop filter construction (single-point, multi-point piecewise interpolation)
8. Response envelope extraction
9. Service health check classification (PASS, BLOCKED, FAIL)
10. Transparent verdict aggregation (GO, NO-GO, BLOCKED, NOT_APPLICABLE)
11. Full report generation (JSON schema structure and markdown summary contents)
"""

import json
import math
import os
import subprocess
import tempfile
from unittest.mock import MagicMock, patch
import urllib.error

import pytest

from scripts.ml.task53_regression import (
    build_ffmpeg_crop_filter,
    calculate_crop_stability,
    check_http_service_health,
    check_talknet_weights_on_disk,
    extract_crop_targets_envelope,
    generate_markdown_summary,
    normalize_path,
    parse_fraction,
    probe_media_file,
    run_preflight,
    run_regression_suite,
    validate_crop_target_data,
    validate_output_media,
)


# ==============================================================================
# 1. Path Normalization Tests
# ==============================================================================

def test_normalize_path_git_bash():
    p = "/c/marvedge-task53-media"
    normalized = normalize_path(p)
    assert normalized.startswith("C:")
    assert "marvedge-task53-media" in normalized


def test_normalize_path_standard_windows():
    p = r"C:\marvedge-task53-media\columbia"
    normalized = normalize_path(p)
    assert normalized.startswith("C:")
    assert "columbia" in normalized


def test_normalize_path_empty():
    assert normalize_path("") == ""
    assert normalize_path("   ") == ""


# ==============================================================================
# 2. Frame Rate / Fraction Parsing Tests
# ==============================================================================

def test_parse_fraction_standard():
    assert parse_fraction("25/1") == 25.0
    assert abs(parse_fraction("30000/1001") - 29.97) < 0.01
    assert parse_fraction("24") == 24.0


def test_parse_fraction_edge_cases():
    assert parse_fraction("0/0") == 0.0
    assert parse_fraction("N/A") == 0.0
    assert parse_fraction("") == 0.0
    assert parse_fraction(None) == 0.0
    assert parse_fraction("invalid") == 0.0


# ==============================================================================
# 3. Media Metadata & Probe Tests
# ==============================================================================

def test_probe_media_file_missing():
    res = probe_media_file(r"C:\non_existent_dir_12345\missing_video.mp4")
    assert res["media_classification"] == "missing"
    assert res["error"] is not None
    assert res["width"] == 0
    assert res["height"] == 0


def test_probe_media_file_video_with_audio():
    sample_ffprobe_output = {
        "format": {"duration": "20.040000", "size": "9286830"},
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "mpeg4",
                "width": 640,
                "height": 360,
                "r_frame_rate": "25/1",
                "avg_frame_rate": "25/1",
                "nb_frames": "501",
            },
            {
                "codec_type": "audio",
                "codec_name": "mp3",
                "channels": 2,
                "sample_rate": "44100",
            },
        ],
    }

    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = json.dumps(sample_ffprobe_output)

    with patch("os.path.isfile", return_value=True), \
         patch("os.path.getsize", return_value=9286830), \
         patch("subprocess.run", return_value=mock_proc):
        res = probe_media_file(r"C:\dummy\02_single_speaker.avi")
        assert res["width"] == 640
        assert res["height"] == 360
        assert res["aspect_ratio"] == "640:360"
        assert res["fps"] == 25.0
        assert res["duration_seconds"] == 20.04
        assert res["has_audio"] is True
        assert res["audio_codec"] == "mp3"
        assert res["media_classification"] == "video_with_audio"
        assert res["error"] is None


def test_probe_media_file_silent_video():
    sample_silent_output = {
        "format": {"duration": "15.448789", "size": "4061421"},
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 720,
                "height": 480,
                "r_frame_rate": "30000/1001",
                "avg_frame_rate": "30000/1001",
                "nb_frames": "463",
            },
        ],
    }

    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = json.dumps(sample_silent_output)

    with patch("os.path.isfile", return_value=True), \
         patch("os.path.getsize", return_value=4061421), \
         patch("subprocess.run", return_value=mock_proc):
        res = probe_media_file(r"C:\dummy\06_moving_subject.mp4")
        assert res["width"] == 720
        assert res["height"] == 480
        assert res["has_audio"] is False
        assert res["audio_codec"] is None
        assert res["media_classification"] == "silent_video"


def test_probe_media_file_corrupt():
    mock_proc = MagicMock()
    mock_proc.returncode = 1
    mock_proc.stderr = "Invalid data found when processing input"

    with patch("os.path.isfile", return_value=True), \
         patch("os.path.getsize", return_value=100), \
         patch("subprocess.run", return_value=mock_proc):
        res = probe_media_file(r"C:\dummy\corrupt.mp4")
        assert res["media_classification"] == "corrupt_media"
        assert "ffprobe error" in res["error"]


# ==============================================================================
# 4. CropTargetData Validation Tests
# ==============================================================================

def test_validate_crop_target_data_valid():
    valid_data = {
        "schema_version": 1,
        "source": {"width": 1280, "height": 720, "duration_sec": 10.0},
        "output": {"aspect_ratio": "9:16"},
        "crop_targets": [
            {
                "timestamp_sec": 0.0,
                "crop": {"x": 437.5, "y": 0.0, "width": 405.0, "height": 720.0},
            },
            {
                "timestamp_sec": 1.0,
                "crop": {"x": 450.0, "y": 0.0, "width": 405.0, "height": 720.0},
            },
            {
                "timestamp_sec": 2.0,
                "crop": {"x": 460.0, "y": 0.0, "width": 405.0, "height": 720.0},
            },
        ],
    }
    res = validate_crop_target_data(valid_data, source_width=1280, source_height=720, duration_sec=10.0)
    assert res["is_valid"] is True
    assert res["total_crop_targets"] == 3
    assert res["valid_crop_targets"] == 3
    assert res["invalid_crop_targets"] == 0
    assert res["validity_percentage"] == 100.0
    assert len(res["errors"]) == 0


def test_validate_crop_target_data_non_monotonic_timestamps():
    invalid_ts_data = {
        "schema_version": 1,
        "crop_targets": [
            {"timestamp_sec": 1.0, "crop": {"x": 10, "y": 0, "width": 100, "height": 200}},
            {"timestamp_sec": 0.5, "crop": {"x": 10, "y": 0, "width": 100, "height": 200}},  # Decreasing!
        ],
    }
    res = validate_crop_target_data(invalid_ts_data, source_width=1280, source_height=720, duration_sec=5.0)
    assert res["is_valid"] is False
    assert res["valid_crop_targets"] == 1
    assert res["invalid_crop_targets"] == 1
    assert any("not strictly increasing" in err for err in res["errors"])


def test_validate_crop_target_data_out_of_bounds():
    oob_data = {
        "schema_version": 1,
        "crop_targets": [
            {"timestamp_sec": 0.0, "crop": {"x": 1200, "y": 0, "width": 200, "height": 720}},  # 1200 + 200 = 1400 > 1280!
        ],
    }
    res = validate_crop_target_data(oob_data, source_width=1280, source_height=720, duration_sec=5.0)
    assert res["is_valid"] is False
    assert res["invalid_crop_targets"] == 1
    assert any("exceeds source width" in err for err in res["errors"])


def test_validate_crop_target_data_negative_dimensions():
    neg_data = {
        "schema_version": 1,
        "crop_targets": [
            {"timestamp_sec": 0.0, "crop": {"x": -10, "y": 0, "width": 100, "height": -50}},
        ],
    }
    res = validate_crop_target_data(neg_data, source_width=1280, source_height=720, duration_sec=5.0)
    assert res["is_valid"] is False
    assert any("negative" in err for err in res["errors"])


def test_validate_crop_target_data_malformed():
    assert validate_crop_target_data("not-a-dict", 1280, 720, 5.0)["is_valid"] is False
    assert validate_crop_target_data({"schema_version": 2}, 1280, 720, 5.0)["is_valid"] is False
    assert validate_crop_target_data({"schema_version": 1, "crop_targets": "not-a-list"}, 1280, 720, 5.0)["is_valid"] is False


# ==============================================================================
# 5. Crop Stability Calculation Tests
# ==============================================================================

def test_calculate_crop_stability_empty():
    res = calculate_crop_stability([])
    assert res["trajectory_points"] == 0
    assert res["mean_pos_delta"] is None
    assert res["stability_evaluation"] == "NOT_APPLICABLE"


def test_calculate_crop_stability_single_frame():
    res = calculate_crop_stability([{"timestamp_sec": 0.0, "crop": {"x": 100, "y": 0, "width": 360, "height": 640}}])
    assert res["trajectory_points"] == 1
    assert res["mean_pos_delta"] == 0.0
    assert res["mean_velocity"] == 0.0
    assert res["stability_evaluation"] == "PASS"


def test_calculate_crop_stability_smooth_motion():
    # 5 frames moving smoothly +10px per second
    targets = [
        {"timestamp_sec": float(i), "crop": {"x": float(100 + i * 10), "y": 0.0, "width": 360.0, "height": 640.0}}
        for i in range(5)
    ]
    res = calculate_crop_stability(targets)
    assert res["trajectory_points"] == 5
    assert abs(res["mean_pos_delta"] - 10.0) < 0.001
    assert abs(res["max_pos_delta"] - 10.0) < 0.001
    assert abs(res["mean_velocity"] - 10.0) < 0.001
    assert abs(res["velocity_variance"] - 0.0) < 0.001
    assert res["stability_evaluation"] == "PASS"


def test_calculate_crop_stability_jittery_motion():
    # Sudden erratic jump of 200px
    targets = [
        {"timestamp_sec": 0.0, "crop": {"x": 100.0, "y": 0.0, "width": 360.0, "height": 640.0}},
        {"timestamp_sec": 1.0, "crop": {"x": 300.0, "y": 0.0, "width": 360.0, "height": 640.0}},  # Jump!
        {"timestamp_sec": 2.0, "crop": {"x": 100.0, "y": 0.0, "width": 360.0, "height": 640.0}},  # Jump back!
    ]
    res = calculate_crop_stability(targets)
    assert res["trajectory_points"] == 3
    assert res["max_pos_delta"] == 200.0
    assert res["stability_evaluation"] == "REVIEW_REQUIRED"


def test_calculate_crop_stability_zero_time_delta():
    # Guard against ZeroDivisionError
    targets = [
        {"timestamp_sec": 1.0, "crop": {"x": 100.0, "y": 0.0, "width": 360.0, "height": 640.0}},
        {"timestamp_sec": 1.0, "crop": {"x": 120.0, "y": 0.0, "width": 360.0, "height": 640.0}},
    ]
    res = calculate_crop_stability(targets)
    assert res["trajectory_points"] == 2
    assert res["mean_pos_delta"] == 20.0
    assert res["mean_velocity"] == 0.0  # Guarded velocity fallback


# ==============================================================================
# 6. Output Media Validation Tests
# ==============================================================================

def test_validate_output_media_non_existent():
    res = validate_output_media(r"C:\dummy\missing_output.mp4")
    assert res["exists"] is False
    assert res["valid"] is False
    assert len(res["errors"]) > 0


def test_validate_output_media_portrait_9_16():
    with patch("os.path.isfile", return_value=True), \
         patch("os.path.getsize", return_value=500000), \
         patch("scripts.ml.task53_regression.probe_media_file", return_value={
             "width": 1080,
             "height": 1920,
             "duration_seconds": 20.0,
             "has_audio": True,
             "error": None,
         }):
        res = validate_output_media(r"C:\dummy\output_portrait.mp4", expected_ratio_str="9:16", expect_audio=True)
        assert res["exists"] is True
        assert res["valid"] is True
        assert res["portrait_orientation"] is True
        assert res["audio_preserved"] is True
        assert len(res["errors"]) == 0


def test_validate_output_media_landscape_failure():
    # Landscape 1920x1080 should fail portrait validation
    with patch("os.path.isfile", return_value=True), \
         patch("os.path.getsize", return_value=500000), \
         patch("scripts.ml.task53_regression.probe_media_file", return_value={
             "width": 1920,
             "height": 1080,
             "duration_seconds": 20.0,
             "has_audio": True,
             "error": None,
         }):
        res = validate_output_media(r"C:\dummy\output_landscape.mp4", expected_ratio_str="9:16", expect_audio=True)
        assert res["valid"] is False
        assert res["portrait_orientation"] is False
        assert any("Output is landscape" in err for err in res["errors"])


# ==============================================================================
# 7. FFmpeg Crop Filter Generation Tests
# ==============================================================================

def test_build_ffmpeg_crop_filter_empty():
    assert build_ffmpeg_crop_filter([]) is None


def test_build_ffmpeg_crop_filter_single():
    targets = [{"timestamp_sec": 0.0, "crop": {"x": 100, "y": 50, "width": 360, "height": 640}}]
    filter_str = build_ffmpeg_crop_filter(targets)
    assert filter_str is not None
    assert filter_str.startswith("crop=360:640:")
    assert "iw-360" in filter_str
    assert "exact=1" in filter_str


def test_build_ffmpeg_crop_filter_interpolated():
    targets = [
        {"timestamp_sec": 0.0, "crop": {"x": 100, "y": 50, "width": 360, "height": 640}},
        {"timestamp_sec": 2.0, "crop": {"x": 200, "y": 50, "width": 360, "height": 640}},
    ]
    filter_str = build_ffmpeg_crop_filter(targets)
    assert filter_str is not None
    assert "if(lt(t," in filter_str
    assert "crop=360:640:" in filter_str


# ==============================================================================
# 8. Envelope Extraction Tests
# ==============================================================================

def test_extract_crop_targets_envelope():
    # Format 1: Direct root
    d1 = {"crop_targets": [{"timestamp_sec": 0.0}]}
    assert extract_crop_targets_envelope(d1) == d1

    # Format 2: Nested ok: true
    d2 = {"ok": True, "crop_targets": {"crop_targets": [{"timestamp_sec": 0.0}]}}
    assert extract_crop_targets_envelope(d2) == d2["crop_targets"]

    # Format 3: Alternate camelCase
    d3 = {"cropTargets": {"crop_targets": [{"timestamp_sec": 0.0}]}}
    assert extract_crop_targets_envelope(d3) == d3["cropTargets"]

    # Non-envelope
    assert extract_crop_targets_envelope("string") is None
    assert extract_crop_targets_envelope({"status": "error"}) is None


from scripts.ml.task53_regression import call_reframe_service


def test_call_reframe_service_no_double_file_wrap():
    """file:// URLs must not be re-wrapped as file://file://...

    This was a real bug: when --containerMediaDir produced file:///tmp/task53-media/foo.avi,
    call_reframe_service was wrapping it again as file://file:///tmp/... causing AutoFlip's
    download_video() to receive a malformed URL and fail with 'Local file not found'.
    """
    captured_payload = {}

    def fake_urlopen(req, timeout=None):
        import json as _json
        captured_payload.update(_json.loads(req.data.decode()))
        # Simulate HTTP error to abort without real network
        raise urllib.error.URLError("no network in test")

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        call_reframe_service(
            gateway_url="http://localhost:8000",
            video_path_or_url="file:///tmp/task53-media/02_single_speaker.avi",
            target_aspect_ratio="9:16",
        )

    sent_url = captured_payload.get("videoUrl", "")
    assert sent_url == "file:///tmp/task53-media/02_single_speaker.avi", (
        f"Expected file:///tmp/... but got: {sent_url!r}. "
        "file:// URLs must not be double-wrapped."
    )
    assert not sent_url.startswith("file://file://"), (
        f"Double file:// detected: {sent_url!r}"
    )


# ==============================================================================
# 9. Service Health Check Tests
# ==============================================================================

def test_check_http_service_health_healthy():
    mock_resp = MagicMock()
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.status = 200
    mock_resp.read.return_value = json.dumps({"status": "ok", "services": {"autoflip": "healthy", "talknet": "healthy"}}).encode()

    with patch("urllib.request.urlopen", return_value=mock_resp):
        res = check_http_service_health("http://localhost:8000")
        assert res["status"] == "PASS"
        assert res["http_status"] == 200
        assert res["error"] is None


def test_check_http_service_health_degraded_no_autoflip():
    """HTTP 503 without autoflip=healthy in body: remains BLOCKED (gateway truly unavailable)."""
    err = urllib.error.HTTPError(
        url="http://localhost:8000/health",
        code=503,
        msg="Service Unavailable",
        hdrs={},
        fp=MagicMock(read=lambda: json.dumps({"status": "degraded"}).encode()),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        res = check_http_service_health("http://localhost:8000")
        assert res["status"] == "BLOCKED"
        assert res["http_status"] == 503


def test_check_http_service_health_degraded_autoflip_healthy():
    """HTTP 503 with autoflip=healthy in body: classified DEGRADED, not BLOCKED.

    This is the real-world scenario where TalkNet weights are missing (service degraded)
    but AutoFlip is healthy and /reframe is fully executable. The harness previously
    misclassified this as BLOCKED, suppressing all case execution.
    """
    degraded_body = json.dumps({
        "status": "degraded",
        "services": {"autoflip": "healthy", "talknet": "degraded"},
    }).encode()
    err = urllib.error.HTTPError(
        url="http://localhost:8000/health",
        code=503,
        msg="Service Unavailable",
        hdrs={},
        fp=MagicMock(read=lambda: degraded_body),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        res = check_http_service_health("http://localhost:8000")
        assert res["status"] == "DEGRADED", (
            f"Expected DEGRADED but got {res['status']}. "
            "Gateway is reachable and AutoFlip is healthy; TalkNet degraded only."
        )
        assert res["http_status"] == 503
        assert res["data"]["services"]["autoflip"] == "healthy"
        assert "AutoFlip healthy" in res["error"]


def test_check_http_service_health_connection_refused():
    err = urllib.error.URLError("[WinError 10061] No connection could be made")
    with patch("urllib.request.urlopen", side_effect=err):
        res = check_http_service_health("http://localhost:8000")
        assert res["status"] == "BLOCKED"
        assert "Service connection error" in res["error"]


# ==============================================================================
# 10. Preflight & Model Weights Tests
# ==============================================================================

def test_check_talknet_weights_on_disk():
    # Verified: repo does not check in weights
    weights = check_talknet_weights_on_disk(os.getcwd())
    assert weights["all_weights_ready"] is False
    assert weights["s3fd_weights_found"] is False


def test_run_preflight_missing_directory():
    res = run_preflight(
        media_dir=r"C:\completely_missing_directory_12345",
        gateway_url="http://localhost:8000",
        repo_root=os.getcwd(),
    )
    assert res["media_dir_exists"] is False
    assert res["status"] == "BLOCKED"
    assert len(res["missing_assets"]) == 5


# ==============================================================================
# 11. Full Regression Suite Execution & Report Generation Tests
# ==============================================================================

def test_run_regression_suite_dry_run_structure():
    with tempfile.TemporaryDirectory() as tmp_out:
        report = run_regression_suite(
            media_dir="C:\\marvedge-task53-media",
            output_dir=tmp_out,
            target_ratio="9:16",
            gateway_url="http://localhost:8000",
            dry_run=True,
        )

        # Check required schema keys
        assert report["task"] == "TASK-00053"
        assert "timestamp" in report
        assert "configuration" in report
        assert "preflight" in report
        assert "services" in report
        assert "cases" in report
        assert "aggregate_metrics" in report
        assert "blocked_criteria" in report
        assert "architectural_gaps" in report
        assert "summary" in report

        # Verify 5 logical cases
        assert len(report["cases"]) == 5
        cases_dict = {c["logical_case"]: c for c in report["cases"]}
        # Verify Markdown summary generation
        md_text = generate_markdown_summary(report)
        assert "# TASK-00053" in md_text
        assert "Execution Environment" in md_text
        assert "Regression Corpus" in md_text
        assert "Known Architectural Gaps" in md_text
        assert "TalkNet" in md_text and "AutoFlip" in md_text


def test_acceptance_matrix_and_verdict_blocked():
    with tempfile.TemporaryDirectory() as tmp_out:
        report = run_regression_suite(
            media_dir="C:\\marvedge-task53-media",
            output_dir=tmp_out,
            target_ratio="9:16",
            gateway_url="http://localhost:8000",
            dry_run=False,
        )

        assert report["summary"]["overall_decision"] == "BLOCKED"
        assert "BLOCKED" in report["summary"]["verdict"]
        assert "INSUFFICIENT LIVE EVIDENCE FOR GO/NO-GO" in report["summary"]["verdict"]
        assert "sufficient live evidence" in report["summary"]["reason"].lower()

        # Verify Acceptance Matrix
        assert "acceptance_matrix" in report
        matrix = report["acceptance_matrix"]
        assert len(matrix) == 11
        assert matrix[0]["id"] == "A"
        assert matrix[0]["criterion"] == "No reproducible crash"
        assert matrix[0]["status"] == "BLOCKED"
        assert "automated repository tests passed" in matrix[0]["evidence"].lower()

        md_text = generate_markdown_summary(report)
        assert "INSUFFICIENT LIVE EVIDENCE FOR GO/NO-GO" in md_text
        assert "Task-53 Acceptance Matrix (A\u2013K)" in md_text
        assert "Task-53 therefore does not yet have sufficient live evidence for a final GO/NO-GO decision" in md_text

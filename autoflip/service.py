"""
Service layer for headless AutoFlip video reframing (Task-00023).
Stateless execution logic for POST /reframe.
"""

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from typing import Any, Dict

import requests

logger = logging.getLogger("reframe-service")

# Default executable and graph locations inside the container
DEFAULT_AUTOFILP_BINARY = os.environ.get(
    "AUTOFILP_BINARY_PATH", "/usr/local/bin/run_autoflip_to_json"
)
DEFAULT_GRAPH_CONFIG = os.environ.get(
    "AUTOFILP_GRAPH_PATH",
    "/mediapipe/mediapipe/examples/desktop/autoflip/autoflip_headless_graph.pbtxt",
)
DEFAULT_PROCESS_TIMEOUT_SEC = int(os.environ.get("AUTOFILP_TIMEOUT_SEC", "150"))
DEFAULT_DOWNLOAD_TIMEOUT_SEC = int(os.environ.get("DOWNLOAD_TIMEOUT_SEC", "60"))

ASPECT_RATIO_REGEX = re.compile(r"^\d+:\d+$")


class ReframeError(Exception):
    """Base exception for reframe processing errors."""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class ValidationError(ReframeError):
    def __init__(self, message: str):
        super().__init__(message, status_code=400)


class DownloadError(ReframeError):
    def __init__(self, message: str):
        super().__init__(message, status_code=502)


class TimeoutError(ReframeError):
    def __init__(self, message: str):
        super().__init__(message, status_code=504)


class ExecutionError(ReframeError):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message, status_code=status_code)


def validate_reframe_request(video_url: Any, target_aspect_ratio: Any) -> None:
    """Validates incoming request fields."""
    if not video_url or not isinstance(video_url, str) or not video_url.strip():
        raise ValidationError("videoUrl is required and must be a non-empty string")

    stripped_url = video_url.strip()
    if not (
        stripped_url.startswith("http://")
        or stripped_url.startswith("https://")
        or stripped_url.startswith("file://")
    ):
        raise ValidationError(
            "videoUrl must be a valid HTTP, HTTPS, or file URL"
        )

    if (
        not target_aspect_ratio
        or not isinstance(target_aspect_ratio, str)
        or not target_aspect_ratio.strip()
    ):
        raise ValidationError(
            "targetAspectRatio is required and must be a non-empty string"
        )

    if not ASPECT_RATIO_REGEX.match(target_aspect_ratio.strip()):
        raise ValidationError(
            f"targetAspectRatio '{target_aspect_ratio}' is invalid; expected format like '9:16', '1:1', or '4:5'"
        )


def download_video(
    url: str,
    dest_path: str,
    timeout_sec: int = DEFAULT_DOWNLOAD_TIMEOUT_SEC,
) -> None:
    """Downloads remote video URL into dest_path via streaming chunks."""
    if url.startswith("file://"):
        local_src = url[7:]
        if not os.path.isfile(local_src):
            raise DownloadError(f"Local file not found: {local_src}")
        shutil.copyfile(local_src, dest_path)
        return

    try:
        with requests.get(url, stream=True, timeout=timeout_sec) as resp:
            resp.raise_for_status()
            with open(dest_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        f.write(chunk)
    except requests.exceptions.Timeout:
        raise DownloadError(
            f"Video download timed out after {timeout_sec} seconds"
        )
    except requests.exceptions.RequestException as e:
        raise DownloadError(f"Failed to download video from {url}: {str(e)}")

    if not os.path.exists(dest_path) or os.path.getsize(dest_path) == 0:
        raise DownloadError(f"Downloaded video is empty or missing: {dest_path}")


def run_autoflip_subprocess(
    binary_path: str,
    graph_path: str,
    input_video_path: str,
    output_json_path: str,
    aspect_ratio: str,
    timeout_sec: int = DEFAULT_PROCESS_TIMEOUT_SEC,
) -> None:
    """Runs the AutoFlip headless CLI binary safely using subprocess argument vector."""
    if not os.path.isfile(binary_path):
        raise ExecutionError(
            f"AutoFlip binary not found at '{binary_path}'"
        )

    if not os.path.isfile(graph_path):
        raise ExecutionError(
            f"AutoFlip graph config file not found at '{graph_path}'"
        )

    cmd = [
        binary_path,
        f"--calculator_graph_config_file={graph_path}",
        f"--input_video_path={input_video_path}",
        f"--output_json_path={output_json_path}",
        f"--aspect_ratio={aspect_ratio}",
    ]

    logger.info("Executing AutoFlip command: %s", " ".join(cmd))

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_sec,
            text=True,
            cwd="/mediapipe" if os.path.isdir("/mediapipe") else None,
        )
    except subprocess.TimeoutExpired as e:
        logger.error("AutoFlip process timed out after %d seconds", timeout_sec)
        raise TimeoutError(
            f"AutoFlip analysis timed out after {timeout_sec} seconds"
        ) from e
    except Exception as e:
        logger.error("Failed to spawn AutoFlip process: %s", str(e))
        raise ExecutionError(f"Subprocess spawn error: {str(e)}") from e

    if proc.returncode != 0:
        stderr_sample = (proc.stderr or proc.stdout or "").strip()
        last_lines = "\n".join(stderr_sample.splitlines()[-10:])
        logger.error(
            "AutoFlip exited with code %d. Stderr:\n%s",
            proc.returncode,
            last_lines,
        )
        raise ExecutionError(
            f"AutoFlip binary failed with exit code {proc.returncode}: {last_lines}"
        )


def parse_and_validate_json_output(output_json_path: str) -> Dict[str, Any]:
    """Reads and validates the generated CropTargetData JSON file."""
    if not os.path.isfile(output_json_path):
        raise ExecutionError(
            f"Expected output JSON file was not produced: {output_json_path}"
        )

    if os.path.getsize(output_json_path) == 0:
        raise ExecutionError(
            f"Output JSON file produced by AutoFlip is empty: {output_json_path}"
        )

    try:
        with open(output_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise ExecutionError(
            f"AutoFlip produced malformed JSON: {str(e)}"
        ) from e

    if not isinstance(data, dict):
        raise ExecutionError("Output JSON root must be an object")

    if "crop_targets" not in data or not isinstance(data["crop_targets"], list):
        raise ExecutionError(
            "Output JSON missing 'crop_targets' array"
        )

    # Defensive contract validation: verify timestamps are non-negative, monotonic,
    # and do not exceed source duration (preventing corrupted payloads from returning HTTP 200).
    source = data.get("source")
    duration_sec = None
    if isinstance(source, dict):
        raw_dur = source.get("duration_sec")
        if isinstance(raw_dur, (int, float)) and raw_dur > 0:
            duration_sec = float(raw_dur)

    max_allowed_ts = (duration_sec + 0.5) if duration_sec is not None else None
    prev_ts = -1.0
    for idx, target in enumerate(data["crop_targets"]):
        if not isinstance(target, dict):
            raise ExecutionError(f"crop_targets[{idx}] must be an object")
        ts = target.get("timestamp_sec")
        if ts is None or not isinstance(ts, (int, float)):
            raise ExecutionError(
                f"crop_targets[{idx}].timestamp_sec is missing or non-numeric"
            )
        ts_float = float(ts)
        if ts_float < 0.0:
            raise ExecutionError(
                f"crop_targets[{idx}].timestamp_sec ({ts_float}) is negative"
            )
        if max_allowed_ts is not None and ts_float > max_allowed_ts:
            raise ExecutionError(
                f"crop_targets[{idx}].timestamp_sec ({ts_float}) exceeds source duration ({duration_sec})"
            )
        if idx > 0 and ts_float <= prev_ts:
            raise ExecutionError(
                f"crop_targets[{idx}].timestamp_sec ({ts_float}) is not strictly increasing (prev: {prev_ts})"
            )
        prev_ts = ts_float

    return data


def process_reframe(
    video_url: str,
    target_aspect_ratio: str,
    binary_path: str = DEFAULT_AUTOFILP_BINARY,
    graph_path: str = DEFAULT_GRAPH_CONFIG,
    timeout_sec: int = DEFAULT_PROCESS_TIMEOUT_SEC,
    download_timeout_sec: int = DEFAULT_DOWNLOAD_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """
    End-to-end execution of a single reframe request:
    1. Validates input
    2. Stages video in temporary directory
    3. Executes AutoFlip binary
    4. Parses resulting CropTargetData JSON
    5. Cleans up temporary files in finally block
    """
    validate_reframe_request(video_url, target_aspect_ratio)

    temp_id = uuid.uuid4().hex
    temp_dir = os.path.join(tempfile.gettempdir(), f"reframe_{temp_id}")
    os.makedirs(temp_dir, exist_ok=True)

    staged_video_path = os.path.join(temp_dir, "input.mp4")
    output_json_path = os.path.join(temp_dir, "crop_targets.json")

    try:
        logger.info(
            "Staging video for reframe job %s from %s", temp_id, video_url
        )
        download_video(
            video_url, staged_video_path, timeout_sec=download_timeout_sec
        )

        logger.info(
            "Running AutoFlip analysis on %s (aspect_ratio=%s)",
            staged_video_path,
            target_aspect_ratio,
        )
        run_autoflip_subprocess(
            binary_path=binary_path,
            graph_path=graph_path,
            input_video_path=staged_video_path,
            output_json_path=output_json_path,
            aspect_ratio=target_aspect_ratio,
            timeout_sec=timeout_sec,
        )

        crop_targets_data = parse_and_validate_json_output(output_json_path)
        logger.info(
            "Reframe job %s completed successfully with %d crop targets",
            temp_id,
            len(crop_targets_data.get("crop_targets", [])),
        )

        return {
            "ok": True,
            "crop_targets": crop_targets_data,
        }
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
            logger.debug("Cleaned up temporary directory %s", temp_dir)

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
from typing import Any, Dict, Optional

import requests
import ipaddress
import socket
from requests.adapters import HTTPAdapter
from urllib3.connection import HTTPConnection, HTTPSConnection
from urllib3.connectionpool import HTTPConnectionPool, HTTPSConnectionPool
from urllib.parse import urljoin, urlparse
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
MAX_REDIRECTS = 5
DEFAULT_MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024  # 250 MB
try:
    MAX_DOWNLOAD_SIZE_BYTES = int(
        os.environ.get("MAX_DOWNLOAD_SIZE_BYTES", str(DEFAULT_MAX_DOWNLOAD_BYTES))
    )
except (TypeError, ValueError):
    MAX_DOWNLOAD_SIZE_BYTES = DEFAULT_MAX_DOWNLOAD_BYTES
if MAX_DOWNLOAD_SIZE_BYTES <= 0:
    MAX_DOWNLOAD_SIZE_BYTES = DEFAULT_MAX_DOWNLOAD_BYTES


class PeerBlockedError(ConnectionError):
    """Raised when a connected peer IP is not publicly routable."""


def _is_unsafe_ip(address: str) -> bool:
    """Returns True when an IP belongs to a private or otherwise unsafe range."""
    try:
        ip = ipaddress.ip_address(str(address).split("%", 1)[0])
    except ValueError:
        return True

    return (
        not ip.is_global
        or ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def _peer_ip(sock) -> str:
    """
    Returns the numeric peer address of a connected socket.

    Raises PeerBlockedError when the peer is not publicly routable. This is the
    connection sink check that closes the DNS-rebinding TOCTOU window: it runs
    before any HTTP request bytes are exchanged. For HTTPS this is after the TLS
    handshake, so no request data can reach an internal peer.
    """
    try:
        peer = sock.getpeername()
    except OSError as exc:
        raise PeerBlockedError("Unable to determine remote peer address") from exc

    if not isinstance(peer, tuple) or not peer:
        raise PeerBlockedError("Unable to determine remote peer address")

    address = str(peer[0])
    if _is_unsafe_ip(address):
        raise PeerBlockedError(
            f"Refusing connection to non-public peer address {address}"
        )
    return address


class _PeerValidationMixin:
    """Validates the actual peer IP before any request bytes are sent."""

    def _new_conn(self):
        sock = super()._new_conn()
        try:
            _peer_ip(sock)
        except BaseException:
            try:
                sock.close()
            except OSError:
                pass
            raise
        return sock


class _PeerValidatingHTTPConnection(_PeerValidationMixin, HTTPConnection):
    pass


class _PeerValidatingHTTPSConnection(_PeerValidationMixin, HTTPSConnection):
    pass


class _PeerValidatingHTTPConnectionPool(HTTPConnectionPool):
    ConnectionCls = _PeerValidatingHTTPConnection


class _PeerValidatingHTTPSConnectionPool(HTTPSConnectionPool):
    ConnectionCls = _PeerValidatingHTTPSConnection


class _PeerValidatingHTTPAdapter(HTTPAdapter):
    """requests adapter that installs peer-IP-validating urllib3 pools."""

    def init_poolmanager(self, *args, **kwargs):
        super().init_poolmanager(*args, **kwargs)
        self.poolmanager.pool_classes_by_scheme = {
            "http": _PeerValidatingHTTPConnectionPool,
            "https": _PeerValidatingHTTPSConnectionPool,
        }


def _build_safe_session() -> requests.Session:
    """Builds a requests session with connection-sink peer validation."""
    session = requests.Session()
    # Ignore proxy environment variables: a proxy's public peer IP would not
    # represent the actual destination and would bypass the peer check.
    session.trust_env = False
    adapter = _PeerValidatingHTTPAdapter()
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def _is_peer_blocked_error(exc: BaseException) -> bool:
    """Walks requests/urllib3 exception chains looking for PeerBlockedError."""
    seen = set()
    current: Optional[BaseException] = exc
    while current is not None and id(current) not in seen:
        if isinstance(current, PeerBlockedError):
            return True
        seen.add(id(current))
        current = current.__cause__ or current.__context__
    return False


def _remove_partial_file(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except OSError as exc:
        logger.warning("Could not remove partial download %s: %s", path, exc)


def _declared_content_length(resp) -> Optional[int]:
    raw = resp.headers.get("Content-Length")
    if raw is None or not isinstance(raw, str):
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError) as exc:
        raise DownloadError(
            "Remote server returned an invalid Content-Length"
        ) from exc
    if value < 0:
        raise DownloadError("Remote server returned a negative Content-Length")
    return value


def _validate_remote_url(url: str) -> None:
    """Validates that an HTTP(S) URL does not target an unsafe destination."""
    parsed = urlparse(url)

    if parsed.scheme not in {"http", "https"}:
        raise ValidationError("videoUrl must use HTTP or HTTPS")

    if not parsed.hostname:
        raise ValidationError("videoUrl must contain a valid hostname")

    try:
        addresses = socket.getaddrinfo(
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as e:
        raise ValidationError(
            f"videoUrl hostname could not be resolved: {parsed.hostname}"
        ) from e

    for address in {result[4][0] for result in addresses}:
        if _is_unsafe_ip(address):
            raise ValidationError(
                "videoUrl must not target a private or internal network address"
            )

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

    if stripped_url.startswith("file://"):
        raise ValidationError(
            "videoUrl must use HTTP or HTTPS"
        )

    if not (
        stripped_url.startswith("http://")
        or stripped_url.startswith("https://")
    ):
        raise ValidationError(
            "videoUrl must be a valid HTTP or HTTPS URL"
        )

    _validate_remote_url(stripped_url)

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
    """
    Downloads a validated public HTTP(S) video URL into dest_path.

    Security properties:
    - Every redirect hop is re-validated before the next request.
    - The actual connected peer IP is validated at the connection sink, so a
      DNS rebind between validation and fetch is rejected before request data.
    - Content-Length (when present) and a running byte count are both capped.
    - Partial files are removed on any failure or size violation.
    """
    current_url = url
    session = _build_safe_session()

    try:
        for redirect_count in range(MAX_REDIRECTS + 1):
            _validate_remote_url(current_url)

            try:
                with session.get(
                    current_url,
                    stream=True,
                    timeout=timeout_sec,
                    allow_redirects=False,
                ) as resp:
                    if resp.is_redirect or resp.is_permanent_redirect:
                        location = resp.headers.get("Location")
                        if not location:
                            raise DownloadError(
                                "Video download returned a redirect without a Location header"
                            )

                        if redirect_count >= MAX_REDIRECTS:
                            raise DownloadError(
                                f"Video download exceeded the maximum of {MAX_REDIRECTS} redirects"
                            )

                        current_url = urljoin(current_url, location)
                        continue

                    resp.raise_for_status()

                    declared_length = _declared_content_length(resp)
                    if (
                        declared_length is not None
                        and declared_length > MAX_DOWNLOAD_SIZE_BYTES
                    ):
                        raise DownloadError(
                            "Video exceeds maximum allowed download size "
                            f"({MAX_DOWNLOAD_SIZE_BYTES} bytes)"
                        )

                    bytes_written = 0
                    with open(dest_path, "wb") as f:
                        for chunk in resp.iter_content(chunk_size=65536):
                            if not chunk:
                                continue
                            bytes_written += len(chunk)
                            if bytes_written > MAX_DOWNLOAD_SIZE_BYTES:
                                raise DownloadError(
                                    "Video exceeds maximum allowed download size "
                                    f"({MAX_DOWNLOAD_SIZE_BYTES} bytes)"
                                )
                            f.write(chunk)

                    break

            except requests.exceptions.Timeout:
                _remove_partial_file(dest_path)
                raise DownloadError(
                    f"Video download timed out after {timeout_sec} seconds"
                )
            except requests.exceptions.ConnectionError as e:
                _remove_partial_file(dest_path)
                if _is_peer_blocked_error(e):
                    raise ValidationError(
                        "videoUrl must not target a private or internal network address"
                    ) from e
                raise DownloadError(
                    f"Failed to download video from {current_url}: {str(e)}"
                )
            except requests.exceptions.RequestException as e:
                _remove_partial_file(dest_path)
                raise DownloadError(
                    f"Failed to download video from {current_url}: {str(e)}"
                )
            except DownloadError:
                _remove_partial_file(dest_path)
                raise
            except OSError as e:
                _remove_partial_file(dest_path)
                raise DownloadError(
                    f"Failed to save downloaded video: {str(e)}"
                ) from e
    finally:
        session.close()

    if not os.path.exists(dest_path) or os.path.getsize(dest_path) == 0:
        _remove_partial_file(dest_path)
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

    if len(data["crop_targets"]) == 0:
        raise ExecutionError(
            "Output JSON produced an empty 'crop_targets' array (no valid frames processed)"
        )

    # Validate output aspect ratio contract if specified
    expected_ratio = None
    output_meta = data.get("output")
    if isinstance(output_meta, dict):
        ar_str = output_meta.get("aspect_ratio")
        if isinstance(ar_str, str) and ASPECT_RATIO_REGEX.match(ar_str.strip()):
            parts = ar_str.strip().split(":")
            w_part, h_part = float(parts[0]), float(parts[1])
            if h_part > 0:
                expected_ratio = w_part / h_part

    # Defensive contract validation: verify timestamps and crop geometries
    source = data.get("source")
    duration_sec = None
    source_width = None
    source_height = None
    if isinstance(source, dict):
        raw_dur = source.get("duration_sec")
        if isinstance(raw_dur, (int, float)) and raw_dur > 0:
            duration_sec = float(raw_dur)
        raw_w = source.get("width")
        if isinstance(raw_w, (int, float)) and raw_w > 0:
            source_width = float(raw_w)
        raw_h = source.get("height")
        if isinstance(raw_h, (int, float)) and raw_h > 0:
            source_height = float(raw_h)

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

        # AF-04 / AF-03 validation: Validate crop bounding box
        crop = target.get("crop")
        if not isinstance(crop, dict):
            raise ExecutionError(f"crop_targets[{idx}] missing 'crop' object")

        for key in ("x", "y", "width", "height"):
            val = crop.get(key)
            if val is None or not isinstance(val, (int, float)):
                raise ExecutionError(f"crop_targets[{idx}].crop.{key} is missing or non-numeric")

        cx = float(crop["x"])
        cy = float(crop["y"])
        cw = float(crop["width"])
        ch = float(crop["height"])

        if cw <= 0.0 or ch <= 0.0:
            raise ExecutionError(
                f"crop_targets[{idx}].crop dimensions must be positive (got width={cw}, height={ch})"
            )
        if cx < -0.5 or cy < -0.5:
            raise ExecutionError(
                f"crop_targets[{idx}].crop coordinates cannot be negative (got x={cx}, y={cy})"
            )

        if source_width is not None and (cx + cw) > (source_width + 0.5):
            raise ExecutionError(
                f"crop_targets[{idx}].crop exceeds source width ({cx} + {cw} > {source_width})"
            )
        if source_height is not None and (cy + ch) > (source_height + 0.5):
            raise ExecutionError(
                f"crop_targets[{idx}].crop exceeds source height ({cy} + {ch} > {source_height})"
            )

        if expected_ratio is not None:
            actual_ratio = cw / ch
            ratio_err = abs(actual_ratio - expected_ratio) / expected_ratio
            if ratio_err > 0.01:
                raise ExecutionError(
                    f"crop_targets[{idx}].crop aspect ratio {actual_ratio:.4f} deviates from target {expected_ratio:.4f} by {ratio_err*100:.2f}% (max 1%)"
                )

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

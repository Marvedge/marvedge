"""
Service layer for containerized TalkNet Active Speaker Detection (Task-00029).
Stateless execution logic for video preprocessing and active speaker inference.
"""

import glob
import ipaddress
import json
import logging
import math
import os
import shutil
import socket
import subprocess
import tempfile
import time
from typing import Any, Dict, List, Optional
import urllib.parse

import cv2
import numpy as np
import requests
import torch

from models.s3fd import S3FD
from models.talkNet import talkNet

logger = logging.getLogger("talknet-service")

# Environment-configurable weight paths and timeouts
DEFAULT_S3FD_WEIGHTS = os.environ.get(
    "TALKNET_S3FD_WEIGHTS", "/app/weights/sfd_face.pth"
)
DEFAULT_MODEL_WEIGHTS = os.environ.get(
    "TALKNET_MODEL_WEIGHTS", "/app/weights/pretrain_TalkSet.model"
)
DEFAULT_PROCESS_TIMEOUT_SEC = int(os.environ.get("TALKNET_TIMEOUT_SEC", "150"))
DEFAULT_DOWNLOAD_TIMEOUT_SEC = int(os.environ.get("DOWNLOAD_TIMEOUT_SEC", "60"))
MAX_DOWNLOAD_SIZE_BYTES = int(
    os.environ.get("MAX_DOWNLOAD_SIZE_BYTES", str(250 * 1024 * 1024))
)  # 250 MB
MAX_REDIRECTS = 5

BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "169.254.169.254",
    "autoflip",
    "talknet",
    "ml-gateway",
    "redis",
}


class TalkNetError(Exception):
    """Base exception for TalkNet processing errors."""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class ValidationError(TalkNetError):
    def __init__(self, message: str):
        super().__init__(message, status_code=400)


class DownloadError(TalkNetError):
    def __init__(self, message: str):
        super().__init__(message, status_code=502)


class MissingWeightsError(TalkNetError):
    def __init__(self, message: str):
        super().__init__(message, status_code=503)


class TimeoutError(TalkNetError):
    def __init__(self, message: str):
        super().__init__(message, status_code=504)


class ExecutionError(TalkNetError):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message, status_code=status_code)


def get_inference_device() -> str:
    """Dynamic device selection: cuda if available, else cpu."""
    return "cuda" if torch.cuda.is_available() else "cpu"


def check_weights_available(
    s3fd_weights: str = DEFAULT_S3FD_WEIGHTS,
    model_weights: str = DEFAULT_MODEL_WEIGHTS,
) -> Dict[str, bool]:
    """Checks whether the required model weights exist on disk."""
    # Check candidates for s3fd
    s3fd_exists = os.path.isfile(s3fd_weights)
    if not s3fd_exists:
        # Check alternate names (e.g. s3fd.pth)
        dirname = os.path.dirname(s3fd_weights)
        alt_s3fd = os.path.join(dirname, "s3fd.pth")
        s3fd_exists = os.path.isfile(alt_s3fd)

    model_exists = os.path.isfile(model_weights)

    return {
        "s3fd": s3fd_exists,
        "model": model_exists,
        "all_ready": s3fd_exists and model_exists,
    }


def is_ip_allowed(ip_str: str) -> bool:
    """Returns True if an IP address is a public routable address."""
    try:
        ip = ipaddress.ip_address(ip_str)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_unspecified
            or ip.is_multicast
            or ip.is_reserved
        ):
            return False
        return True
    except ValueError:
        return False


def validate_url_target(url: str) -> urllib.parse.ParseResult:
    """
    Validates that a URL uses http/https and does not target internal or private networks.
    Prevents SSRF against cloud metadata, loopback, private IPv4/IPv6, and internal containers.
    """
    if not url or not isinstance(url, str) or not url.strip():
        raise ValidationError("videoUrl is required and must be a non-empty string")

    stripped_url = url.strip()
    parsed = urllib.parse.urlparse(stripped_url)

    if parsed.scheme not in ("http", "https"):
        raise ValidationError("videoUrl must have an http or https scheme")

    hostname = parsed.hostname
    if not hostname:
        raise ValidationError("videoUrl host is invalid or missing")

    hostname_lower = hostname.lower()
    if hostname_lower in BLOCKED_HOSTNAMES or hostname_lower.endswith(".localhost"):
        raise ValidationError("videoUrl host is not permitted")

    # If hostname is a direct IP literal
    try:
        ip = ipaddress.ip_address(hostname_lower)
        if not is_ip_allowed(str(ip)):
            raise ValidationError("videoUrl host is not permitted")
        return parsed
    except ValueError:
        pass

    # Resolve hostname via DNS and check all resolved IPs
    try:
        addr_info = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
        if not addr_info:
            raise ValidationError("videoUrl host could not be resolved")
        for entry in addr_info:
            sockaddr = entry[4]
            ip_str = sockaddr[0]
            if not is_ip_allowed(ip_str):
                raise ValidationError("videoUrl host resolves to a non-permitted address")
    except socket.gaierror:
        raise ValidationError("videoUrl host could not be resolved")
    except ValidationError:
        raise
    except Exception as e:
        logger.debug("DNS resolution check failed for %s: %s", hostname, str(e))
        raise ValidationError("videoUrl host could not be validated")

    return parsed


def validate_detect_request(
    video_url: Any,
    min_track_frames: Optional[int] = 10,
    confidence_threshold: Optional[float] = 0.0,
) -> None:
    """Validates incoming detection request parameters."""
    validate_url_target(video_url)

    if min_track_frames is not None:
        if not isinstance(min_track_frames, int) or min_track_frames < 1:
            raise ValidationError("minTrackFrames must be an integer >= 1")

    if confidence_threshold is not None:
        if not isinstance(confidence_threshold, (int, float)):
            raise ValidationError("confidenceThreshold must be a number")


def download_video(
    url: str,
    dest_path: str,
    timeout_sec: int = DEFAULT_DOWNLOAD_TIMEOUT_SEC,
    max_bytes: int = MAX_DOWNLOAD_SIZE_BYTES,
) -> None:
    """
    Downloads remote video into dest_path via streaming chunks.
    Validates redirect targets explicitly to prevent SSRF bypass.
    """
    current_url = url
    redirect_count = 0

    while True:
        # Validate URL target on initial request and on every redirect hop
        validate_url_target(current_url)

        try:
            resp = requests.get(
                current_url,
                stream=True,
                timeout=timeout_sec,
                allow_redirects=False,
            )
        except requests.Timeout:
            raise TimeoutError(
                f"Video download timed out after {timeout_sec}s from {current_url}"
            )
        except ValidationError:
            raise
        except Exception as e:
            raise DownloadError(f"Failed to connect to remote video host")

        if resp.status_code in (301, 302, 303, 307, 308):
            redirect_count += 1
            if redirect_count > MAX_REDIRECTS:
                resp.close()
                raise DownloadError("Too many redirects while downloading video")

            location = resp.headers.get("Location")
            if not location:
                resp.close()
                raise DownloadError("Redirect response missing Location header")

            current_url = urllib.parse.urljoin(current_url, location)
            resp.close()
            continue

        if resp.status_code != 200:
            resp.close()
            raise DownloadError(
                f"Remote video download failed with HTTP status {resp.status_code}"
            )

        bytes_written = 0
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 64):
                if chunk:
                    bytes_written += len(chunk)
                    if bytes_written > max_bytes:
                        resp.close()
                        raise DownloadError(
                            f"Video exceeds maximum allowed download size ({max_bytes} bytes)"
                        )
                    f.write(chunk)
        resp.close()
        break


def check_deadline(deadline: float, timeout_sec: int, stage_name: str) -> float:
    """Verifies that the overall execution deadline has not been exceeded."""
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        logger.warning(
            "TalkNet execution timed out at stage '%s' after %ss", stage_name, timeout_sec
        )
        raise TimeoutError(f"TalkNet execution timed out after {timeout_sec}s")
    return remaining


def bb_intersection_over_union(boxA, boxB):
    """Calculates IOU between two bounding boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    denom = float(boxAArea + boxBArea - interArea)
    if denom <= 0:
        return 0.0
    return interArea / denom


def track_shot(faces_in_shot, min_track: int = 10, num_failed_det: int = 10):
    """
    Groups frame face detections into continuous face tracks.
    Derived from scripts/ml/preprocess_faces.py track_shot.
    """
    from scipy.interpolate import interp1d

    iou_thres = 0.5
    tracks = []
    # Make a copy of list of frame detections
    scene_faces = [list(f) for f in faces_in_shot]

    while True:
        track = []
        for frame_faces in scene_faces:
            for face in list(frame_faces):
                if not track:
                    track.append(face)
                    frame_faces.remove(face)
                elif face["frame"] - track[-1]["frame"] <= num_failed_det:
                    iou = bb_intersection_over_union(face["bbox"], track[-1]["bbox"])
                    if iou > iou_thres:
                        track.append(face)
                        frame_faces.remove(face)
                        continue
                else:
                    break
        if not track:
            break
        elif len(track) >= min_track:
            frame_num = np.array([f["frame"] for f in track])
            bboxes = np.array([np.array(f["bbox"]) for f in track])
            frame_i = np.arange(frame_num[0], frame_num[-1] + 1)
            bboxes_i = []
            for ij in range(4):
                interpfn = interp1d(
                    frame_num,
                    bboxes[:, ij],
                    kind="linear",
                    fill_value="extrapolate",
                )
                bboxes_i.append(interpfn(frame_i))
            bboxes_i = np.stack(bboxes_i, axis=1)
            tracks.append({"frame": frame_i, "bbox": bboxes_i})
    return tracks


def crop_video_track(
    flist: List[str],
    audio_file_path: str,
    track: Dict[str, Any],
    crop_prefix: str,
    crop_scale: float = 0.40,
    deadline: Optional[float] = None,
    timeout_sec: Optional[int] = None,
):
    """
    Crops face clip and corresponding audio slice for a single track.
    Derived from scripts/ml/preprocess_faces.py crop_video.
    """
    from scipy import signal
    from scipy.io import wavfile

    crop_avi = crop_prefix + ".avi"
    crop_wav = crop_prefix + ".wav"
    temp_avi = crop_prefix + "_t.avi"

    v_out = cv2.VideoWriter(
        temp_avi, cv2.VideoWriter_fourcc(*"XVID"), 25, (224, 224)
    )
    dets = {"x": [], "y": [], "s": []}
    for det in track["bbox"]:
        dets["s"].append(max((det[3] - det[1]), (det[2] - det[0])) / 2)
        dets["y"].append((det[1] + det[3]) / 2)
        dets["x"].append((det[0] + det[2]) / 2)

    k_size = min(13, len(dets["s"]))
    if k_size % 2 == 0:
        k_size -= 1
    if k_size >= 3:
        dets["s"] = signal.medfilt(dets["s"], kernel_size=k_size)
        dets["x"] = signal.medfilt(dets["x"], kernel_size=k_size)
        dets["y"] = signal.medfilt(dets["y"], kernel_size=k_size)

    for fidx, frame_num in enumerate(track["frame"]):
        cs = crop_scale
        bs = dets["s"][fidx]
        bsi = int(bs * (1 + 2 * cs))
        if frame_num < len(flist):
            image = cv2.imread(flist[frame_num])
        else:
            image = np.zeros((224, 224, 3), dtype=np.uint8)

        if image is None:
            image = np.zeros((224, 224, 3), dtype=np.uint8)

        frame_pad = np.pad(
            image,
            ((bsi, bsi), (bsi, bsi), (0, 0)),
            "constant",
            constant_values=(110, 110),
        )
        my = dets["y"][fidx] + bsi
        mx = dets["x"][fidx] + bsi

        y1 = max(0, int(my - bs))
        y2 = max(0, int(my + bs * (1 + 2 * cs)))
        x1 = max(0, int(mx - bs * (1 + cs)))
        x2 = max(0, int(mx + bs * (1 + cs)))

        face = frame_pad[y1:y2, x1:x2]
        if face.size == 0:
            face = np.zeros((224, 224, 3), dtype=np.uint8)

        v_out.write(cv2.resize(face, (224, 224)))
    v_out.release()

    audio_start = track["frame"][0] / 25.0
    audio_end = (track["frame"][-1] + 1) / 25.0

    # Extract audio segment
    rem_audio = None
    if deadline is not None and timeout_sec is not None:
        rem_audio = check_deadline(deadline, timeout_sec, "crop-audio-ffmpeg")

    cmd_audio = [
        "ffmpeg",
        "-y",
        "-i",
        audio_file_path,
        "-async",
        "1",
        "-ac",
        "1",
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ss",
        f"{audio_start:.3f}",
        "-to",
        f"{audio_end:.3f}",
        crop_wav,
        "-loglevel",
        "error",
    ]
    subprocess.run(cmd_audio, check=True, timeout=rem_audio)

    # Combine video and audio into avi
    rem_mux = None
    if deadline is not None and timeout_sec is not None:
        rem_mux = check_deadline(deadline, timeout_sec, "crop-mux-ffmpeg")

    cmd_mux = [
        "ffmpeg",
        "-y",
        "-i",
        temp_avi,
        "-i",
        crop_wav,
        "-c:v",
        "copy",
        "-c:a",
        "copy",
        crop_avi,
        "-loglevel",
        "error",
    ]
    subprocess.run(cmd_mux, check=True, timeout=rem_mux)

    if os.path.exists(temp_avi):
        os.remove(temp_avi)

    return {"track": track, "proc_track": dets}


def evaluate_talknet_scores(
    model: talkNet,
    crop_files: List[str],
    pycrop_dir: str,
    device: str,
    deadline: Optional[float] = None,
    timeout_sec: Optional[int] = None,
) -> List[np.ndarray]:
    """
    Runs TalkNet inference over cropped face and audio clips.
    Derived from demoTalkNet.py evaluate_network.
    """
    import python_speech_features
    from scipy.io import wavfile

    all_scores = []
    duration_set = {1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6}

    for crop_file in crop_files:
        if deadline is not None and timeout_sec is not None:
            check_deadline(deadline, timeout_sec, "talknet-eval-crop")

        base_name = os.path.splitext(os.path.basename(crop_file))[0]
        wav_path = os.path.join(pycrop_dir, f"{base_name}.wav")
        avi_path = os.path.join(pycrop_dir, f"{base_name}.avi")

        if not os.path.exists(wav_path) or not os.path.exists(avi_path):
            continue

        sr, audio = wavfile.read(wav_path)
        audio_feature = python_speech_features.mfcc(
            audio, 16000, numcep=13, winlen=0.025, winstep=0.010
        )

        cap = cv2.VideoCapture(avi_path)
        video_feature = []
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            face = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            face = cv2.resize(face, (224, 224))
            # Crop center 112x112
            face = face[56:168, 56:168]
            video_feature.append(face)
        cap.release()

        video_feature = np.array(video_feature)
        if len(video_feature) == 0:
            all_scores.append(np.array([]))
            continue

        length = min(
            (audio_feature.shape[0] - audio_feature.shape[0] % 4) / 100.0,
            video_feature.shape[0] / 25.0,
        )
        if length <= 0:
            all_scores.append(np.zeros(len(video_feature)))
            continue

        audio_feature = audio_feature[: int(round(length * 100)), :]
        video_feature = video_feature[: int(round(length * 25)), :, :]

        all_score = []
        for duration in duration_set:
            if deadline is not None and timeout_sec is not None:
                check_deadline(deadline, timeout_sec, "talknet-eval-duration")

            batch_size = int(math.ceil(length / duration))
            scores = []
            with torch.no_grad():
                for i in range(batch_size):
                    a_slice = audio_feature[
                        i * duration * 100 : (i + 1) * duration * 100, :
                    ]
                    v_slice = video_feature[
                        i * duration * 25 : (i + 1) * duration * 25, :, :
                    ]
                    if len(a_slice) == 0 or len(v_slice) == 0:
                        continue
                    inputA = torch.FloatTensor(a_slice).unsqueeze(0).to(device)
                    inputV = torch.FloatTensor(v_slice).unsqueeze(0).to(device)

                    embedA = model.model.forward_audio_frontend(inputA)
                    embedV = model.model.forward_visual_frontend(inputV)
                    embedA, embedV = model.model.forward_cross_attention(embedA, embedV)
                    out = model.model.forward_audio_visual_backend(embedA, embedV)
                    score = model.lossAV.forward(out, labels=None)
                    scores.extend(score)
            if scores:
                all_score.append(scores)

        if all_score:
            # Mean score across duration scales
            avg_score = np.round(np.mean(np.array(all_score), axis=0), 1).astype(
                float
            )
            all_scores.append(avg_score)
        else:
            all_scores.append(np.zeros(len(video_feature)))

    return all_scores


def run_talknet_pipeline(
    work_dir: str,
    raw_video_path: str,
    min_track_frames: int = 10,
    confidence_threshold: float = 0.0,
    s3fd_weights: str = DEFAULT_S3FD_WEIGHTS,
    model_weights: str = DEFAULT_MODEL_WEIGHTS,
    device: Optional[str] = None,
    timeout_sec: int = DEFAULT_PROCESS_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """
    Executes the full TalkNet active speaker detection pipeline:
    1. Normalizes video and extracts audio & frames.
    2. Runs S3FD face detection and shot tracking.
    3. Runs TalkNet AV inference.
    4. Formats into the standardized JSON response schema.
    All operations are strictly bounded by timeout_sec against a monotonic deadline.
    """
    dev = device or get_inference_device()
    deadline = time.monotonic() + timeout_sec

    # Paths inside temp workspace
    pyavi_dir = os.path.join(work_dir, "pyavi")
    pyframes_dir = os.path.join(work_dir, "pyframes")
    pywork_dir = os.path.join(work_dir, "pywork")
    pycrop_dir = os.path.join(work_dir, "pycrop")

    os.makedirs(pyavi_dir, exist_ok=True)
    os.makedirs(pyframes_dir, exist_ok=True)
    os.makedirs(pywork_dir, exist_ok=True)
    os.makedirs(pycrop_dir, exist_ok=True)

    norm_video_path = os.path.join(pyavi_dir, "video.avi")
    audio_path = os.path.join(pyavi_dir, "audio.wav")

    # Step 1: ffmpeg normalization to 25 FPS
    rem = check_deadline(deadline, timeout_sec, "ffmpeg-normalize")
    cmd_norm = [
        "ffmpeg",
        "-y",
        "-i",
        raw_video_path,
        "-qscale:v",
        "2",
        "-async",
        "1",
        "-r",
        "25",
        norm_video_path,
        "-loglevel",
        "error",
    ]
    subprocess.run(cmd_norm, check=True, timeout=rem)

    # Step 2: ffmpeg audio extraction (16kHz mono)
    rem = check_deadline(deadline, timeout_sec, "ffmpeg-audio")
    cmd_audio = [
        "ffmpeg",
        "-y",
        "-i",
        norm_video_path,
        "-qscale:a",
        "0",
        "-ac",
        "1",
        "-vn",
        "-ar",
        "16000",
        audio_path,
        "-loglevel",
        "error",
    ]
    subprocess.run(cmd_audio, check=True, timeout=rem)

    # Step 3: ffmpeg frame extraction
    rem = check_deadline(deadline, timeout_sec, "ffmpeg-frames")
    cmd_frames = [
        "ffmpeg",
        "-y",
        "-i",
        norm_video_path,
        "-qscale:v",
        "2",
        "-f",
        "image2",
        os.path.join(pyframes_dir, "%06d.jpg"),
        "-loglevel",
        "error",
    ]
    subprocess.run(cmd_frames, check=True, timeout=rem)

    flist = sorted(glob.glob(os.path.join(pyframes_dir, "*.jpg")))
    total_frames = len(flist)
    fps = 25.0
    duration_sec = round(total_frames / fps, 3) if total_frames > 0 else 0.0

    if total_frames == 0:
        return {
            "ok": True,
            "video_info": {"fps": fps, "duration_sec": 0.0},
            "speakers": [],
        }

    # Step 4: Scene Detection (PySceneDetect)
    check_deadline(deadline, timeout_sec, "scene-detect")
    scene_list = []
    try:
        from scenedetect.detectors import ContentDetector
        from scenedetect.scene_manager import SceneManager
        from scenedetect.stats_manager import StatsManager
        from scenedetect.video_manager import VideoManager

        video_manager = VideoManager([norm_video_path])
        stats_manager = StatsManager()
        scene_manager = SceneManager(stats_manager)
        scene_manager.add_detector(ContentDetector())
        base_timecode = video_manager.get_base_timecode()
        video_manager.set_downscale_factor()
        video_manager.start()
        scene_manager.detect_scenes(frame_source=video_manager)
        scene_list = scene_manager.get_scene_list(base_timecode)
    except Exception as e:
        logger.info("Scene detection fallback to single scene (%s)", str(e))

    if not scene_list:
        scene_ranges = [(0, total_frames)]
    else:
        scene_ranges = [
            (s[0].frame_num, s[1].frame_num) for s in scene_list
        ]

    # Step 5: S3FD Face Detection
    detector = S3FD(device=dev, weights_path=s3fd_weights)
    all_faces = []
    for fidx, fname in enumerate(flist):
        if fidx % 10 == 0:
            check_deadline(deadline, timeout_sec, "s3fd-face-detect")
        image = cv2.imread(fname)
        if image is None:
            all_faces.append([])
            continue
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        bboxes = detector.detect_faces(image_rgb, conf_th=0.9, scales=[0.25])
        frame_dets = []
        for bbox in bboxes:
            frame_dets.append(
                {"frame": fidx, "bbox": bbox[:-1].tolist(), "conf": float(bbox[-1])}
            )
        all_faces.append(frame_dets)

    # Step 6: Track faces across scene shots
    check_deadline(deadline, timeout_sec, "shot-tracking")
    all_tracks = []
    for start_f, end_f in scene_ranges:
        if end_f - start_f >= min_track_frames:
            shot_dets = all_faces[start_f:end_f]
            tracks = track_shot(
                shot_dets, min_track=min_track_frames, num_failed_det=10
            )
            all_tracks.extend(tracks)

    if not all_tracks:
        return {
            "ok": True,
            "video_info": {"fps": fps, "duration_sec": duration_sec},
            "speakers": [],
        }

    # Step 7: Crop video & audio clips for each track
    vid_tracks = []
    crop_files = []
    for ii, track in enumerate(all_tracks):
        check_deadline(deadline, timeout_sec, "crop-tracks")
        crop_prefix = os.path.join(pycrop_dir, f"{ii:05d}")
        cropped = crop_video_track(
            flist=flist,
            audio_file_path=audio_path,
            track=track,
            crop_prefix=crop_prefix,
            crop_scale=0.40,
            deadline=deadline,
            timeout_sec=timeout_sec,
        )
        vid_tracks.append(cropped)
        crop_files.append(crop_prefix + ".avi")

    # Step 8: TalkNet Evaluation
    check_deadline(deadline, timeout_sec, "talknet-eval-start")
    model = talkNet(device=dev)
    if os.path.isfile(model_weights):
        model.loadParameters(model_weights)
    model.eval()

    all_scores = evaluate_talknet_scores(
        model=model,
        crop_files=crop_files,
        pycrop_dir=pycrop_dir,
        device=dev,
        deadline=deadline,
        timeout_sec=timeout_sec,
    )

    # Step 9: Assemble final response conforming to contract
    speakers_result = []
    for idx, (vid_track, scores) in enumerate(zip(vid_tracks, all_scores)):
        track_info = vid_track["track"]
        frames = track_info["frame"].tolist()
        bboxes = track_info["bbox"].tolist()

        start_sec = round(float(frames[0]) / fps, 3)
        end_sec = round(float(frames[-1] + 1) / fps, 3)

        frame_entries = []
        valid_scores = []
        for fidx, f_num in enumerate(frames):
            ts = round(float(f_num) / fps, 3)
            bb = [round(float(coord), 1) for coord in bboxes[fidx]]
            score = float(scores[fidx]) if fidx < len(scores) else 0.0
            valid_scores.append(score)
            is_speaking = bool(score >= confidence_threshold)
            frame_entries.append(
                {
                    "frame": int(f_num),
                    "timestamp_sec": ts,
                    "bbox": bb,
                    "speaking_score": round(score, 2),
                    "is_speaking": is_speaking,
                }
            )

        avg_conf = (
            round(float(np.mean(valid_scores)), 2) if valid_scores else 0.0
        )

        speakers_result.append(
            {
                "track_id": f"{idx:05d}",
                "start_time_sec": start_sec,
                "end_time_sec": end_sec,
                "average_confidence": avg_conf,
                "frames": frame_entries,
            }
        )

    return {
        "ok": True,
        "video_info": {
            "fps": fps,
            "duration_sec": duration_sec,
        },
        "speakers": speakers_result,
    }


def process_detect(
    video_url: str,
    min_track_frames: Optional[int] = 10,
    confidence_threshold: Optional[float] = 0.0,
    s3fd_weights: str = DEFAULT_S3FD_WEIGHTS,
    model_weights: str = DEFAULT_MODEL_WEIGHTS,
    timeout_sec: int = DEFAULT_PROCESS_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """
    High-level handler for POST /detect.
    Creates and guarantees cleanup of temporary workspaces.
    Enforces total processing timeout against timeout_sec.
    """
    validate_detect_request(
        video_url=video_url,
        min_track_frames=min_track_frames,
        confidence_threshold=confidence_threshold,
    )

    weights_status = check_weights_available(s3fd_weights, model_weights)
    if not weights_status["all_ready"]:
        logger.warning(
            "Model weights not available: s3fd=%s, model=%s",
            weights_status["s3fd"],
            weights_status["model"],
        )
        raise MissingWeightsError(
            "TalkNet model weights are not configured or missing on disk. "
            "Mount or configure TALKNET_S3FD_WEIGHTS and TALKNET_MODEL_WEIGHTS."
        )

    work_dir = tempfile.mkdtemp(prefix="talknet_")
    try:
        raw_video_path = os.path.join(work_dir, "input_video.mp4")
        logger.info("Downloading video from %s", video_url)
        download_video(video_url, raw_video_path)

        logger.info("Running TalkNet detection in %s (timeout=%ss)", work_dir, timeout_sec)
        result = run_talknet_pipeline(
            work_dir=work_dir,
            raw_video_path=raw_video_path,
            min_track_frames=min_track_frames or 10,
            confidence_threshold=confidence_threshold or 0.0,
            s3fd_weights=s3fd_weights,
            model_weights=model_weights,
            timeout_sec=timeout_sec,
        )
        return result
    except subprocess.TimeoutExpired:
        logger.warning("Subprocess timed out after %ss in TalkNet pipeline", timeout_sec)
        raise TimeoutError(f"TalkNet execution timed out after {timeout_sec}s")
    except (TalkNetError, subprocess.CalledProcessError) as e:
        if isinstance(e, subprocess.CalledProcessError):
            logger.error("Subprocess execution error: %s", str(e))
            raise ExecutionError(f"Video processing failed during FFmpeg step: {e.returncode}")
        raise
    except Exception as e:
        logger.exception("Unexpected error in TalkNet pipeline: %s", str(e))
        raise ExecutionError(f"TalkNet execution failure: {str(e)}")
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
        logger.debug("Cleaned up temp directory %s", work_dir)

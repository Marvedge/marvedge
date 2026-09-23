"""
benchmark_preprocessing_v4.py
──────────────────────────────────────────────────────────────────────────────
Task 00046 — V4 PRODUCTION PIPELINE (FIXED)

Architecture:
  STAGE 1  Audio extraction     — single ffmpeg pass
  STAGE 2  I-frame extraction   — ffmpeg -skip_frame nokey: decode ONLY
                                   keyframes (~300 instead of 64500 frames)
  STAGE 3  YuNet detection      — OpenCV DNN ONNX on keyframes only
  STAGE 4  Bbox interpolation   — scipy interp1d linear
  STAGE 5  IoU tracking + merge — greedy tracker + spatial merge
  STAGE 6  FFmpeg-native crop   — single ffmpeg command per track

CRITICAL FIX from V4-original:
  - Old: fps=2 filter decoded ALL 64500 frames then dropped 99.97% → 1001s
  - New: -skip_frame nokey decodes ONLY ~300 I-frames → ~15-30s
  - Old: 1527 fragmented tracks × 3 ffmpeg calls each → 3+ hours
  - New: Track merging reduces to ~10-30 tracks × 1 ffmpeg call → 1-2 min

Usage:
    python benchmark_preprocessing_v4.py \\
        --videoPath /path/to/video.mp4 \\
        --savePath  output_dir
"""

import sys, os, time, json, argparse, subprocess, pickle, warnings, threading
import numpy as np
import cv2
import tqdm
from scipy import signal
from scipy.interpolate import interp1d
from shutil import rmtree

warnings.filterwarnings("ignore")

TARGET_FPS = 25

YUNET_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/"
    "face_detection_yunet/face_detection_yunet_2023mar.onnx"
)


# ═══════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

def log(msg):
    sys.stderr.write(f"  {msg}\n")
    sys.stderr.flush()


def get_video_info(path):
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,nb_frames",
        "-show_entries", "format=duration",
        "-of", "json", path
    ]
    try:
        raw = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode()
        data = json.loads(raw)
        st   = data.get("streams", [{}])[0]
        fmt  = data.get("format", {})

        w = int(st.get("width",  1920))
        h = int(st.get("height", 1080))

        rfr = st.get("r_frame_rate", "25/1")
        num, den = rfr.split("/") if "/" in rfr else (rfr, "1")
        fps = float(num) / max(float(den), 1e-6)

        duration = float(st.get("duration") or fmt.get("duration") or 0)
        nb = st.get("nb_frames")
        total = int(nb) if nb and nb != "N/A" else int(duration * fps)

        return dict(width=w, height=h, fps=fps,
                    duration=duration, total_frames=total)
    except Exception as e:
        log(f"[WARN] ffprobe failed: {e}")
        return dict(width=1920, height=1080, fps=25, duration=0, total_frames=0)


def ensure_yunet(model_dir):
    os.makedirs(model_dir, exist_ok=True)
    candidates = [
        os.path.join(model_dir, "face_detection_yunet_2023mar.onnx"),
        os.path.join(os.path.dirname(__file__),
                     "../../model/faceDetector/dnn/"
                     "face_detection_yunet_2023mar.onnx"),
    ]
    for p in candidates:
        if os.path.exists(os.path.abspath(p)):
            return os.path.abspath(p)
    dest = candidates[0]
    log(f"[SETUP] Downloading YuNet model → {dest}")
    import urllib.request
    urllib.request.urlretrieve(YUNET_URL, dest)
    log("[SETUP] YuNet model ready")
    return dest


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 1  Audio extraction
# ═══════════════════════════════════════════════════════════════════════════════

def stage_extract_audio(video_path, audio_path, threads=4):
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vn", "-ac", "1", "-ar", "16000",
        "-acodec", "pcm_s16le",
        "-threads", str(threads),
        audio_path,
        "-loglevel", "panic",
    ]
    subprocess.run(cmd, check=True)
    log(f"[S1] audio.wav extracted ({os.path.getsize(audio_path)//1024} KB)")


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 2+3  I-FRAME ONLY extraction + YuNet detection
#
# THE KEY FIX: -skip_frame nokey tells H.264 decoder to skip ALL
# non-keyframe decoding. For a typical 22-min video:
#   OLD: decoded 64500 frames at 3426×1082 → 1001 seconds
#   NEW: decodes ~300 keyframes only         → ~15-30 seconds
# ═══════════════════════════════════════════════════════════════════════════════

def _stderr_reader(pipe, timestamps):
    """Background thread: parse showinfo output for keyframe timestamps."""
    for line in pipe:
        line = line.decode("utf-8", errors="replace")
        if "pts_time:" in line:
            for part in line.split():
                if part.startswith("pts_time:"):
                    try:
                        timestamps.append(float(part.split(":")[1]))
                    except ValueError:
                        pass
                    break
    pipe.close()


def stage_detect(video_path, yunet_path,
                 det_w, det_h, native_w, native_h, duration, threads=4):
    """
    Extract ONLY I-frames via ffmpeg -skip_frame nokey,
    detect faces with YuNet, return sparse detections with timestamps.
    """
    frame_size = det_w * det_h * 3
    scale_x    = native_w / det_w
    scale_y    = native_h / det_h

    # FFmpeg command: decode ONLY keyframes, scale down, pipe raw RGB24
    # showinfo filter emits timestamps to stderr so we know WHEN each
    # keyframe occurs in the video
    vf = f"scale={det_w}:{det_h}:flags=bilinear,showinfo"
    cmd = [
        "ffmpeg",
        "-skip_frame", "nokey",   # ← THIS IS THE KEY: skip ALL P/B frames
        "-flags2", "fast",
        "-threads", "0",
        "-i", video_path,
        "-vf", vf,
        "-f", "rawvideo",
        "-pix_fmt", "rgb24",
        "-vsync", "vfr",          # output only decoded frames (keyframes)
        "-",
    ]
    # Don't use -loglevel panic — we need stderr for showinfo timestamps

    detector = cv2.FaceDetectorYN.create(
        yunet_path, "", (det_w, det_h),
        score_threshold=0.5, nms_threshold=0.3, top_k=5000,
    )

    # Estimate keyframe count (typically 1 every 2-5 seconds)
    est_keyframes = max(10, int(duration / 3))

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=frame_size * 4,
    )

    # Parse timestamps from stderr in background thread
    timestamps = []
    t = threading.Thread(target=_stderr_reader, args=(proc.stderr, timestamps))
    t.daemon = True
    t.start()

    sparse_dets = {}
    fidx = 0

    try:
        with tqdm.tqdm(total=est_keyframes,
                       desc="  [S2+S3] Detect",
                       unit="kf") as pbar:
            while True:
                raw = proc.stdout.read(frame_size)
                if len(raw) < frame_size:
                    break

                frame_rgb = np.frombuffer(raw, dtype=np.uint8).reshape(
                    det_h, det_w, 3
                )
                frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)

                _, faces = detector.detect(frame_bgr)

                # Get timestamp — wait briefly for stderr thread if needed
                ts = None
                for _retry in range(50):
                    if fidx < len(timestamps):
                        ts = timestamps[fidx]
                        break
                    time.sleep(0.01)
                if ts is None:
                    # Fallback: linear estimate
                    ts = fidx * (duration / max(est_keyframes, 1))

                src_frame = int(ts * TARGET_FPS)

                frame_dets = []
                if faces is not None:
                    for face in faces:
                        x,  y  = float(face[0]), float(face[1])
                        fw, fh = float(face[2]), float(face[3])
                        conf   = round(float(face[-1]), 3)

                        x1 = max(0, min(int(x  * scale_x), native_w))
                        y1 = max(0, min(int(y  * scale_y), native_h))
                        x2 = max(0, min(int((x+fw) * scale_x), native_w))
                        y2 = max(0, min(int((y+fh) * scale_y), native_h))

                        frame_dets.append({
                            "frame": src_frame,
                            "timestamp": round(ts, 4),
                            "bbox":  [x1, y1, x2, y2],
                            "conf":  conf,
                        })

                sparse_dets[fidx] = frame_dets
                fidx += 1
                pbar.update(1)
                pbar.total = max(pbar.total, fidx + 1)

    finally:
        proc.stdout.close()
        proc.wait()
        t.join(timeout=5)

    n_faces = sum(len(v) for v in sparse_dets.values())
    log(f"[S2+S3] {fidx} keyframes decoded | {n_faces} face detections")
    return sparse_dets, fidx


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 4  Bbox interpolation
# ═══════════════════════════════════════════════════════════════════════════════

def bb_iou(a, b):
    xA = max(a[0], b[0]); yA = max(a[1], b[1])
    xB = min(a[2], b[2]); yB = min(a[3], b[3])
    inter = max(0, xB - xA) * max(0, yB - yA)
    aA = max(0, a[2]-a[0]) * max(0, a[3]-a[1])
    aB = max(0, b[2]-b[0]) * max(0, b[3]-b[1])
    denom = float(aA + aB - inter)
    return inter / denom if denom > 0 else 0.0


def stage_interpolate(sparse_dets, duration, native_w, native_h):
    """
    Interpolate between keyframe detections to fill TARGET_FPS timeline.
    """
    total_target_frames = int(duration * TARGET_FPS) + TARGET_FPS

    dets = [[] for _ in range(total_target_frames)]

    # Place known detections
    pipe_indices = sorted(sparse_dets.keys())
    for pidx in pipe_indices:
        for det in sparse_dets[pidx]:
            tf = det["frame"]
            if 0 <= tf < total_target_frames:
                dets[tf].append(det)

    # Interpolate between consecutive keyframe detections
    for i in range(len(pipe_indices) - 1):
        pi_s, pi_e = pipe_indices[i], pipe_indices[i + 1]
        d_s, d_e   = sparse_dets[pi_s], sparse_dets[pi_e]
        if not d_s or not d_e:
            continue

        tf_s = d_s[0]["frame"] if d_s else 0
        tf_e = d_e[0]["frame"] if d_e else 0
        gap  = tf_e - tf_s
        if gap <= 1:
            continue

        # Greedy IoU matching
        matches = []
        for ai, a in enumerate(d_s):
            for bi, b in enumerate(d_e):
                iou = bb_iou(a["bbox"], b["bbox"])
                if iou >= 0.3:
                    matches.append((iou, ai, bi))
        matches.sort(reverse=True)

        used_a, used_b = set(), set()
        for _, ai, bi in matches:
            if ai in used_a or bi in used_b:
                continue
            used_a.add(ai)
            used_b.add(bi)

            bb_s = np.array(d_s[ai]["bbox"], dtype=float)
            bb_e = np.array(d_e[bi]["bbox"], dtype=float)

            for g in range(1, gap):
                alpha = g / gap
                tf = tf_s + g
                if tf >= total_target_frames:
                    continue
                interp_bb = (bb_s * (1 - alpha) + bb_e * alpha).tolist()
                dets[tf].append({
                    "frame": tf,
                    "timestamp": round(tf / TARGET_FPS, 4),
                    "bbox": interp_bb,
                    "conf": 0.9,
                })

    n_dense = sum(1 for d in dets if len(d) > 0)
    log(f"[S4] {n_dense}/{total_target_frames} frames with detections")
    return dets


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 5  IoU tracking + SPATIAL MERGE
#
# THE KEY FIX: after tracking, merge tracks that refer to the same face
# (high spatial overlap). Old V4 produced 1527 tracks — a talk show has ~5-10.
# ═══════════════════════════════════════════════════════════════════════════════

def stage_track(dets, min_track=10, num_failed_det=200, min_face_size=1):
    """
    Greedy IoU tracker with increased num_failed_det to handle keyframe gaps.
    num_failed_det=200 → tolerate up to 8 seconds of missing detections
    (keyframes are typically 2-5s apart, so gaps are expected).
    """
    active, completed = [], []

    for fidx, faces in enumerate(dets):
        still = []
        for t in active:
            last_frame = t[-1]["frame"]
            if fidx - last_frame > num_failed_det:
                completed.append(t)
            else:
                still.append(t)
        active = still

        if not faces:
            continue

        matches = []
        for ti, t in enumerate(active):
            for di, d in enumerate(faces):
                iou = bb_iou(d["bbox"], t[-1]["bbox"])
                if iou >= 0.3:
                    matches.append((iou, ti, di))
        matches.sort(reverse=True)

        used_t, used_d = set(), set()
        for _, ti, di in matches:
            if ti not in used_t and di not in used_d:
                active[ti].append(faces[di])
                used_t.add(ti)
                used_d.add(di)

        for di, d in enumerate(faces):
            if di not in used_d:
                active.append([d])

    completed.extend(active)

    # Build track objects
    raw_tracks = []
    for raw in completed:
        if len(raw) < min_track:
            continue

        fn = np.array([f["frame"] for f in raw], dtype=float)
        bb = np.array([f["bbox"]  for f in raw], dtype=float)

        uf, ui = np.unique(fn, return_index=True)
        if len(uf) < min_track:
            continue
        fn = uf
        bb = bb[ui]

        fi = np.arange(int(fn[0]), int(fn[-1]) + 1)
        bi = np.stack(
            [interp1d(fn, bb[:, j], bounds_error=False,
                      fill_value=(bb[0, j], bb[-1, j]))(fi)
             for j in range(4)],
            axis=1
        )

        mw = np.mean(bi[:, 2] - bi[:, 0])
        mh = np.mean(bi[:, 3] - bi[:, 1])
        if max(mw, mh) < min_face_size:
            continue

        raw_tracks.append({
            "frame":       fi,
            "bbox":        bi,
            "is_fallback": False,
        })

    # ── MERGE overlapping tracks ──────────────────────────────────────────
    # Two tracks referring to the same face will have highly overlapping
    # spatial centers. Merge them.
    if raw_tracks:
        raw_tracks = _merge_tracks(raw_tracks)

    raw_tracks.sort(key=lambda x: x["frame"][0])
    log(f"[S5] {len(raw_tracks)} face tracks found (after merge)")
    return raw_tracks


def _merge_tracks(tracks, center_dist_thresh=0.15):
    """
    Merge tracks with similar spatial centers.
    center_dist_thresh: max normalized distance between track centers to merge
    (0.15 = 15% of frame diagonal).
    """
    # Compute center for each track
    centers = []
    for t in tracks:
        bb = t["bbox"]
        cx = float(np.median((bb[:, 0] + bb[:, 2]) / 2))
        cy = float(np.median((bb[:, 1] + bb[:, 3]) / 2))
        centers.append((cx, cy))

    # Union-Find merge
    parent = list(range(len(tracks)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            # Keep the longer track as root
            la = len(tracks[ra]["frame"])
            lb = len(tracks[rb]["frame"])
            if la >= lb:
                parent[rb] = ra
            else:
                parent[ra] = rb

    for i in range(len(tracks)):
        for j in range(i + 1, len(tracks)):
            ci, cj = centers[i], centers[j]
            dist = ((ci[0] - cj[0])**2 + (ci[1] - cj[1])**2) ** 0.5
            # Normalize by frame diagonal (approximate)
            avg_w = float(np.mean(tracks[i]["bbox"][:, 2] - tracks[i]["bbox"][:, 0]))
            if avg_w > 0 and dist < avg_w * 1.5:
                union(i, j)

    # Group by root
    groups = {}
    for i in range(len(tracks)):
        r = find(i)
        groups.setdefault(r, []).append(i)

    # For each group, keep the longest track
    merged = []
    for root, members in groups.items():
        longest = max(members, key=lambda i: len(tracks[i]["frame"]))
        merged.append(tracks[longest])

    return merged


def center_crop_fallback(total_frames, native_w, native_h, min_track=10):
    if total_frames < min_track:
        return None
    pad = 0.33
    x1, y1 = int(native_w * (0.5 - pad/2)), int(native_h * (0.5 - pad/2))
    x2, y2 = int(native_w * (0.5 + pad/2)), int(native_h * (0.5 + pad/2))
    frames = np.arange(total_frames)
    bboxes = np.tile(np.array([x1, y1, x2, y2], dtype=float), (total_frames, 1))
    log("[S5] No tracks found — using center-crop fallback")
    return {"frame": frames, "bbox": bboxes, "is_fallback": True}


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 6  FFmpeg-native crop — SINGLE command per track
#
# THE KEY FIX: old V4 used 3 ffmpeg invocations per track (video, audio, mux).
# At 7.2s × 1527 tracks = 3+ hours. Now: 1 command per track, ~10-30 tracks.
# ═══════════════════════════════════════════════════════════════════════════════

def _smooth_bboxes(bboxes, kernel=13):
    k = min(kernel, len(bboxes))
    if k % 2 == 0:
        k -= 1
    if k < 3:
        return bboxes
    return np.stack(
        [signal.medfilt(bboxes[:, j], kernel_size=k) for j in range(4)],
        axis=1
    )


def crop_one_track(video_path, audio_path, track, crop_base_path,
                   crop_scale=0.40, threads=4, native_w=1920, native_h=1080):
    """
    Single FFmpeg command: fast-seek → crop → scale → encode + audio mux → AVI.
    """
    frames = track["frame"]
    bboxes = _smooth_bboxes(track["bbox"])

    cx = float(np.median((bboxes[:, 0] + bboxes[:, 2]) / 2))
    cy = float(np.median((bboxes[:, 1] + bboxes[:, 3]) / 2))
    cs = float(np.median(
        np.maximum(bboxes[:, 2] - bboxes[:, 0],
                   bboxes[:, 3] - bboxes[:, 1]) / 2
    ))

    crop_w = int(cs * 2 * (1 + crop_scale))
    crop_h = int(cs * 2 * (1 + 2 * crop_scale))
    crop_x = max(0, min(int(cx - crop_w / 2), native_w - crop_w))
    crop_y = max(0, min(int(cy - crop_h / 2), native_h - crop_h))

    crop_w = min(crop_w, native_w - crop_x)
    crop_h = min(crop_h, native_h - crop_y)
    if crop_w < 32 or crop_h < 32:
        return None

    start_sec = float(frames[0]) / TARGET_FPS
    end_sec   = float(frames[-1] + 1) / TARGET_FPS
    duration  = end_sec - start_sec

    out_avi = f"{crop_base_path}.avi"

    # Single FFmpeg command: video crop + audio slice + mux into AVI
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{start_sec:.4f}",          # fast seek video
        "-i", video_path,
        "-ss", f"{start_sec:.4f}",          # fast seek audio
        "-i", audio_path,
        "-t", f"{duration:.4f}",
        "-filter:v", (f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y},"
                      f"scale=224:224"),
        "-r", str(TARGET_FPS),
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-c:a", "copy",
        "-threads", str(threads),
        out_avi,
        "-loglevel", "panic",
    ]
    subprocess.run(cmd, check=True)
    return out_avi


def stage_crop(video_path, audio_path, tracks, pycrop_dir,
               crop_scale=0.40, threads=4, native_w=1920, native_h=1080):
    results = []
    for ii, track in tqdm.tqdm(enumerate(tracks),
                                total=len(tracks),
                                desc="  [S6] Crop"):
        out = crop_one_track(
            video_path, audio_path, track,
            os.path.join(pycrop_dir, f"{ii:05d}"),
            crop_scale=crop_scale, threads=threads,
            native_w=native_w, native_h=native_h,
        )
        if out:
            results.append({"track_id": ii, "path": out})
    log(f"[S6] {len(results)} crops written to {pycrop_dir}")
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def parse_args():
    p = argparse.ArgumentParser(description="V4 Production Face-Crop Pipeline")
    p.add_argument("--videoPath",  required=True)
    p.add_argument("--savePath",   required=True)
    p.add_argument("--reportPath", default=None)
    p.add_argument("--detScale",   type=float, default=0.25)
    p.add_argument("--minTrack",   type=int,   default=10)
    p.add_argument("--numFailedDet", type=int, default=200)
    p.add_argument("--minFaceSize", type=int,  default=1)
    p.add_argument("--cropScale",  type=float, default=0.40)
    p.add_argument("--threads",    type=int,   default=4)
    # extractFps is no longer used — we extract keyframes only
    p.add_argument("--extractFps", type=float, default=2, help="(ignored, kept for compat)")
    return p.parse_args()


def main():
    args = parse_args()

    if args.reportPath is None:
        args.reportPath = os.path.join(args.savePath, "benchmark_report.json")

    if os.path.exists(args.savePath):
        rmtree(args.savePath)
    pywork = os.path.join(args.savePath, "pywork")
    pycrop = os.path.join(args.savePath, "pycrop")
    os.makedirs(pywork, exist_ok=True)
    os.makedirs(pycrop, exist_ok=True)
    audio_path = os.path.join(args.savePath, "audio.wav")

    vinfo    = get_video_info(args.videoPath)
    native_w = vinfo["width"]
    native_h = vinfo["height"]
    duration = vinfo["duration"]
    det_w    = max(64, int(native_w * args.detScale))
    det_h    = max(64, int(native_h * args.detScale))

    model_dir  = os.path.join(os.path.dirname(__file__), "../../model/faceDetector/dnn")
    yunet_path = ensure_yunet(model_dir)

    report = {
        "pipeline":            "V4-FIXED (I-frame-only + YuNet + track-merge + single-cmd crop)",
        "input_video":         os.path.basename(args.videoPath),
        "input_duration_sec":  round(duration, 2),
        "resolution":          f"{native_w}x{native_h}",
        "source_fps":          round(vinfo["fps"], 2),
        "total_frames":        vinfo["total_frames"],
        "detection_resolution": f"{det_w}x{det_h}",
        "detection_method":    "I-frame only (skip_frame nokey)",
        "stages":              [],
        "total_wall_time_sec": 0,
        "fps_throughput":      0,
        "realtime_ratio":      0,
        "tracks_found":        0,
        "fallback_tracks_found": 0,
    }

    # Banner
    sys.stderr.write("\n" + "=" * 72 + "\n")
    sys.stderr.write("  V4 PRODUCTION PIPELINE (FIXED)\n")
    sys.stderr.write(f"  Video    : {os.path.basename(args.videoPath)}\n")
    sys.stderr.write(f"  Duration : {duration/60:.1f} min  |  "
                     f"Res: {native_w}x{native_h}  |  "
                     f"FPS: {vinfo['fps']:.0f}\n")
    sys.stderr.write(f"  Detector : YuNet ONNX (CPU)  |  "
                     f"Det res: {det_w}x{det_h}  |  "
                     f"I-frame only\n")
    sys.stderr.write("=" * 72 + "\n\n")

    t_wall = time.time()

    def timed(label, fn):
        t0 = time.time()
        result = fn()
        elapsed = round(time.time() - t0, 2)
        report["stages"].append({"stage": label, "wall_time_sec": elapsed})
        sys.stderr.write(f"  [{label}]  {elapsed:.2f}s\n")
        return result

    # S1
    timed("S1 Audio extract",
          lambda: stage_extract_audio(args.videoPath, audio_path, args.threads))

    # S2+S3
    sparse_dets, n_keyframes = timed(
        "S2+S3 Keyframe detect",
        lambda: stage_detect(
            args.videoPath, yunet_path,
            det_w, det_h, native_w, native_h, duration, args.threads
        )
    )

    # S4
    dets = timed(
        "S4 Interpolate",
        lambda: stage_interpolate(sparse_dets, duration, native_w, native_h)
    )

    # S5
    def do_track():
        tracks = stage_track(
            dets, args.minTrack, args.numFailedDet, args.minFaceSize
        )
        if not tracks:
            total_target = len(dets)
            fb = center_crop_fallback(total_target, native_w, native_h, args.minTrack)
            if fb:
                tracks = [fb]
        return tracks

    tracks = timed("S5 Track+Merge", do_track)

    n_fb = sum(1 for t in tracks if t.get("is_fallback", False))
    report["tracks_found"]          = len(tracks)
    report["fallback_tracks_found"] = n_fb

    # S6
    vid_tracks = timed(
        "S6 FFmpeg crop",
        lambda: stage_crop(
            args.videoPath, audio_path, tracks, pycrop,
            crop_scale=args.cropScale, threads=args.threads,
            native_w=native_w, native_h=native_h
        )
    )

    with open(os.path.join(pywork, "tracks.pckl"), "wb") as f:
        pickle.dump({"tracks": tracks, "vid_tracks": vid_tracks}, f)

    total_elapsed = round(time.time() - t_wall, 2)
    report["total_wall_time_sec"] = total_elapsed
    report["fps_throughput"]      = round(vinfo["total_frames"] / max(total_elapsed, 1), 2)
    report["realtime_ratio"]      = round(duration / max(total_elapsed, 1), 2)

    os.makedirs(os.path.dirname(args.reportPath) or ".", exist_ok=True)
    with open(args.reportPath, "w") as f:
        json.dump(report, f, indent=2)

    sys.stderr.write("\n" + "=" * 72 + "\n")
    sys.stderr.write(f"  {'STAGE':<28}  {'TIME':>10}\n")
    sys.stderr.write("  " + "-" * 42 + "\n")
    for s in report["stages"]:
        sys.stderr.write(f"  {s['stage']:<28}  {s['wall_time_sec']:>8.2f}s\n")
    sys.stderr.write("  " + "-" * 42 + "\n")
    sys.stderr.write(f"  {'TOTAL':<28}  {total_elapsed:>8.2f}s\n")
    sys.stderr.write("=" * 72 + "\n")
    sys.stderr.write(f"  Throughput  : {report['fps_throughput']} fps\n")
    sys.stderr.write(f"  Realtime    : {report['realtime_ratio']}x\n")
    sys.stderr.write(f"  Tracks      : {report['tracks_found']}"
                     f"  ({report['fallback_tracks_found']} fallback)\n")
    sys.stderr.write(f"  Report      : {args.reportPath}\n")
    sys.stderr.write("=" * 72 + "\n")


if __name__ == "__main__":
    main()

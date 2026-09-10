"""
cursor_detector.py — OS-Agnostic Cursor Detection for Screen Recordings

Detects mouse cursors in screen recordings of dynamic content (movies,
games, presentations) where the background is constantly changing.

Works with ANY operating system cursor (macOS, Windows, Linux).

Algorithm (Overlay Persistence Detection):
  The key insight is that in a screen recording, the cursor is composited
  ON TOP of the underlying content by the OS. When the background changes
  between frames but the cursor is stationary, the cursor region will be
  the ONLY small area that does NOT change. When the cursor moves, we
  detect the small isolated delta.

  Strategy:
    1. Accumulate N consecutive frames into a temporal median to get a
       "background plate" — the cursor will appear as a ghostly overlay
       because it moves while the background is stable per-scene.
    2. For each frame, subtract the median. The residual highlights the
       cursor (and any other overlay like a watermark).
    3. Filter residuals by size (cursor-sized: 4–3000 px²) and shape.
    4. Track the best candidate across frames using proximity scoring.
    5. When the movie scene is highly dynamic (action scenes), fall back
       to detecting the cursor via its characteristic edge pattern —
       a small, high-contrast, non-rectangular shape.

Usage:
  python cursor_detector.py --video input.mp4 --output cursor_track.json
"""

import cv2
import numpy as np
import argparse
import json
from collections import deque
from tqdm import tqdm


# ---------------------------------------------------------------------------
# Strategy 1: Temporal-median residual (works when cursor is moving)
# ---------------------------------------------------------------------------

def detect_via_median_residual(frame_gray, median_bg, 
                                min_area=4, max_area=3000, thresh=30):
    """Subtract the running median from the current frame. The cursor
    will stand out as a small bright region in the residual."""
    residual = cv2.absdiff(frame_gray, median_bg)
    _, mask = cv2.threshold(residual, thresh, 255, cv2.THRESH_BINARY)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if min_area <= area <= max_area:
            x, y, w, h = cv2.boundingRect(cnt)
            aspect = max(w, h) / (min(w, h) + 1e-6)
            if aspect < 5.0:
                candidates.append((x, y, w, h, area))
    return candidates


# ---------------------------------------------------------------------------
# Strategy 2: High-contrast small-object detector (fallback)
# ---------------------------------------------------------------------------

def detect_via_local_contrast(frame_gray,
                               min_area=4, max_area=3000,
                               block_size=51, C=10):
    """Use adaptive thresholding to find small high-contrast objects.
    Cursors are typically white/black with a hard edge — they pop out."""
    adaptive = cv2.adaptiveThreshold(
        frame_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, block_size, C)

    # Invert so bright-on-dark cursors become white blobs
    inv = cv2.bitwise_not(adaptive)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    inv = cv2.morphologyEx(inv, cv2.MORPH_OPEN, kernel, iterations=1)
    inv = cv2.morphologyEx(inv, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(inv, cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if min_area <= area <= max_area:
            x, y, w, h = cv2.boundingRect(cnt)
            aspect = max(w, h) / (min(w, h) + 1e-6)
            if aspect < 5.0:
                candidates.append((x, y, w, h, area))
    return candidates


# ---------------------------------------------------------------------------
# Tracker: maintains cursor position across frames
# ---------------------------------------------------------------------------

class CursorTracker:
    def __init__(self, max_jump_px=400):
        self.last_pos = None
        self.max_jump = max_jump_px
        self.hits = 0

    def pick_best(self, candidates):
        if not candidates:
            self.hits = max(0, self.hits - 1)
            return None

        if self.last_pos is None:
            # Cold start — pick smallest (most cursor-like)
            best = min(candidates, key=lambda c: c[4])
        else:
            def dist(c):
                cx, cy = c[0] + c[2] / 2, c[1] + c[3] / 2
                return np.hypot(cx - self.last_pos[0],
                                cy - self.last_pos[1])
            scored = sorted(candidates, key=dist)
            best = scored[0]
            if dist(best) > self.max_jump:
                self.hits = max(0, self.hits - 1)
                return None

        x, y, w, h, area = best
        self.last_pos = (x + w / 2, y + h / 2)
        self.hits += 1
        conf = min(1.0, 0.3 + 0.1 * self.hits)

        return {"x": int(x), "y": int(y),
                "w": int(w), "h": int(h),
                "confidence": round(conf, 3)}


# ---------------------------------------------------------------------------
# Main processing loop
# ---------------------------------------------------------------------------

def process_video(video_path, output_path,
                  frame_skip=2, max_frames=None,
                  median_window=15, residual_thresh=30):

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"ERROR: Cannot open {video_path}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    limit = min(total, max_frames) if max_frames else total
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"Video: {fw}x{fh} @ {fps:.1f}fps | {total} frames ({total/fps:.1f}s)")
    print(f"Median window: {median_window} | Residual thresh: {residual_thresh}")
    print(f"Processing every {frame_skip} frame(s) up to frame {limit}\n")

    # --- Build initial median background from first N frames ---
    buf = deque(maxlen=median_window)
    for i in range(min(median_window * frame_skip, limit)):
        ret, f = cap.read()
        if not ret:
            break
        if i % frame_skip == 0:
            buf.append(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY))

    if len(buf) < 3:
        print("ERROR: Not enough frames to build median background")
        return

    median_bg = np.median(np.stack(buf), axis=0).astype(np.uint8)

    tracker = CursorTracker()
    results = {"video": video_path, "fps": fps,
               "resolution": f"{fw}x{fh}",
               "total_frames": total, "frames": {}}

    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    detected = 0

    for idx in tqdm(range(0, limit, frame_skip), desc="Detecting"):
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Primary: median-residual detection
        candidates = detect_via_median_residual(
            gray, median_bg, thresh=residual_thresh)

        # Fallback: if no candidates, try local-contrast
        if not candidates:
            candidates = detect_via_local_contrast(gray)

        det = tracker.pick_best(candidates)
        if det:
            results["frames"][str(idx)] = det
            detected += 1

        # Update the running median with this frame
        buf.append(gray)
        if idx % (median_window * frame_skip) == 0 and len(buf) >= 3:
            median_bg = np.median(np.stack(buf), axis=0).astype(np.uint8)

    cap.release()

    results["detected_frames"] = detected
    total_processed = max(1, limit // frame_skip)
    results["detection_rate"] = (
        f"{detected}/{total_processed} "
        f"({100 * detected / total_processed:.1f}%)")

    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n{'='*50}")
    print(f"✅  Cursor detected in {detected} frames")
    print(f"   Rate: {results['detection_rate']}")
    print(f"   Saved: {output_path}")
    print(f"{'='*50}")


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    ap = argparse.ArgumentParser(
        description="OS-agnostic cursor detection for screen recordings")
    ap.add_argument("--video", required=True)
    ap.add_argument("--output", default="cursor_track.json")
    ap.add_argument("--skip", type=int, default=2,
                    help="Process every Nth frame")
    ap.add_argument("--max_frames", type=int, default=None)
    ap.add_argument("--median_window", type=int, default=15,
                    help="Number of frames for temporal median")
    ap.add_argument("--residual_thresh", type=int, default=30,
                    help="Threshold for median residual (lower = more sensitive)")
    args = ap.parse_args()

    process_video(args.video, args.output,
                  frame_skip=args.skip,
                  max_frames=args.max_frames,
                  median_window=args.median_window,
                  residual_thresh=args.residual_thresh)

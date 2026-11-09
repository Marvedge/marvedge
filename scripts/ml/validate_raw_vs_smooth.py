#!/usr/bin/env python
"""Validate that the instrumented ``track_shot`` reproduces the exact
behaviour of the production implementation.

This script:

1. Imports the original ``track_shot`` from ``talknet.service``.
2. Provides an instrumented copy ``track_shot_instrumented`` that adds
   bookkeeping (counts short tracks discarded) while preserving the
   original logic unchanged.
3. Generates deterministic synthetic detections (a long track with
   occasional missed detections and a short track that should be filtered
   out).
4. Runs **both** implementations on the same input and asserts that the
   resulting tracks, perâ€‘track frame arrays and interpolated bounding boxes
   are identical.
5. Reports:
   * Number of short tracks discarded.
   * Detection coverage (observed frames / total frames).
   * Interpolation coverage (interpolatedâ€‘only frames / total frames).
   * Average centre displacement on observed frames.
   * Average perâ€‘frame movement for observed and interpolatedâ€‘only
     segments.

The script runs **without** invoking the full TalkNet pipeline (no S3FD,
no audioâ€‘visual inference) and works on Windows.
"""

import sys
import argparse
import os
from pathlib import Path
# Ensure repository root is on PYTHONPATH for local imports
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)
from typing import List, Dict, Any
import numpy as np
from scipy.interpolate import interp1d

# Load production functions without importing the full TalkNet service
import ast

service_path = Path(__file__).resolve().parents[2] / "talknet" / "service.py"
service_tree = ast.parse(service_path.read_text(encoding="utf-8"))
required = {"bb_intersection_over_union", "track_shot"}
nodes = [
    node for node in service_tree.body
    if isinstance(node, ast.FunctionDef) and node.name in required
]
if {node.name for node in nodes} != required:
    raise RuntimeError("Could not find both production functions")

module = ast.Module(body=nodes, type_ignores=[])
ast.fix_missing_locations(module)
namespace = {"np": np}
exec(compile(module, str(service_path), "exec"), namespace)
track_shot_original = namespace["track_shot"]

# ---------------------------------------------------------------------------
# Instrumented copy preserving exact behaviour
# ---------------------------------------------------------------------------

def track_shot_instrumented(
    faces_in_shot: List[List[Dict[str, Any]]],
    min_track: int = 10,
    num_failed_det: int = 10,
) -> List[Dict[str, Any]]:
    """Copy of ``talknet.service.track_shot`` with bookkeeping.

    Returns the same list of tracks as the production code while also
    printing the number of short tracks that were discarded via the
    ``min_track`` threshold.
    """

    short_tracks_discarded = 0
    iou_thres = 0.5
    tracks: List[Dict[str, Any]] = []
    # Make a copy of list of frame detections
    scene_faces = [list(f) for f in faces_in_shot]

    while True:
        track: List[Dict[str, Any]] = []
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
            tracks.append({
                "frame": frame_i,
                "bbox": bboxes_i,
                "observed_frames": frame_num.copy(),
            })
        else:
            short_tracks_discarded += 1

    print(f"Short tracks discarded: {short_tracks_discarded}")
    return tracks

# ---------------------------------------------------------------------------
# Helper utility â€“ identical to the one used in ``talknet.service``
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Synthetic detection generator (deterministic for reproducibility)
# ---------------------------------------------------------------------------

def generate_synthetic_detections() -> List[List[Dict[str, Any]]]:
    """Create a synthetic ``faces_in_shot`` list.

    The list is indexed by frame number. Each entry is a list of detection
    dictionaries with keys ``frame`` and ``bbox`` (``[x1, y1, x2, y2]``).
    """
    total_frames = 20
    detections: List[List[Dict[str, Any]]] = [[] for _ in range(total_frames)]

    # Long track â€“ will survive ``min_track`` thresholds.
    for f in range(total_frames):
        # Skip detection on every 4th frame to force interpolation.
        if f % 4 == 2:
            continue
        bbox = [10 + f, 20 + f, 60 + f, 80 + f]
        detections[f].append({"frame": f, "bbox": bbox})

    # Short track â€“ should be filtered out when ``min_track``=5.
    for f in range(2, 5):
        bbox = [200, 200, 250, 250]
        detections[f].append({"frame": f, "bbox": bbox})

    return detections

# ---------------------------------------------------------------------------
# Metric calculations
# ---------------------------------------------------------------------------


def compute_metrics(faces_in_shot, tracks):
    """Calculate coverage and movement using detections belonging to each track."""
    total_frames = 0
    observed_frames = 0
    interpolated_frames = 0
    centre_disp_observed = []
    movement_interpolated = []

    for trk in tracks:
        frame_nums = np.asarray(trk["frame"])
        bboxes = np.asarray(trk["bbox"], dtype=float)

        # Identify detections that belong to this retained track.

        observed_set = set(
            int(frame) for frame in trk["observed_frames"]
        )
        is_observed = [
            int(frame) in observed_set for frame in frame_nums
        ]


        total_frames += len(frame_nums)
        observed_frames += sum(is_observed)
        interpolated_frames += len(frame_nums) - sum(is_observed)

        centres = (bboxes[:, :2] + bboxes[:, 2:]) / 2
        obs_idxs = [i for i, flag in enumerate(is_observed) if flag]

        if len(obs_idxs) >= 2:
            diffs = np.linalg.norm(
                np.diff(centres[obs_idxs], axis=0), axis=1
            )
            centre_disp_observed.extend(diffs.tolist())

        start = None
        for i, flag in enumerate(is_observed + [True]):
            if not flag and start is None:
                start = i
            elif flag and start is not None:
                if i - start >= 2:
                    diffs = np.linalg.norm(
                        np.diff(centres[start:i], axis=0), axis=1
                    )
                    movement_interpolated.extend(diffs.tolist())
                start = None

    return {
        "total_frames": total_frames,
        "observed_frames": observed_frames,
        "interpolated_frames": interpolated_frames,
        "detection_coverage": (
            observed_frames / total_frames if total_frames else 0.0
        ),
        "interpolation_coverage": (
            interpolated_frames / total_frames if total_frames else 0.0
        ),
        "center_disp_observed": (
            float(np.mean(centre_disp_observed))
            if centre_disp_observed else 0.0
        ),
        "movement_interpolated": (
            float(np.mean(movement_interpolated))
            if movement_interpolated else 0.0
        ),
    }

# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def compare_raw_vs_smoothed(tracks):
    from scipy import signal
    results = {}
    for key in ("x", "y", "s"):
        raw_parts, smooth_parts = [], []
        for track in tracks:
            boxes = np.asarray(track["bbox"], dtype=float)
            if not len(boxes):
                continue
            if key == "x":
                values = (boxes[:, 0] + boxes[:, 2]) / 2
            elif key == "y":
                values = (boxes[:, 1] + boxes[:, 3]) / 2
            else:
                values = np.maximum(
                    boxes[:, 2] - boxes[:, 0],
                    boxes[:, 3] - boxes[:, 1]
                ) / 2
            kernel = min(13, len(values))
            if kernel % 2 == 0:
                kernel -= 1
            smoothed = signal.medfilt(values, kernel_size=kernel) if kernel >= 3 else values.copy()
            raw_parts.extend(values.tolist())
            smooth_parts.extend(smoothed.tolist())
        raw = np.asarray(raw_parts)
        smooth = np.asarray(smooth_parts)
        results[key] = {
            "mean_absolute_change": float(np.mean(np.abs(raw - smooth))) if len(raw) else 0.0,
            "max_absolute_change": float(np.max(np.abs(raw - smooth))) if len(raw) else 0.0,
        }
    return results


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate tracking and compare raw/smoothed crop coordinates")
    parser.add_argument("--min-track", type=int, default=5)
    parser.add_argument("--num-failed-det", type=int, default=2)
    args = parser.parse_args(argv)

    synthetic = generate_synthetic_detections()
    original = track_shot_original(
        synthetic, min_track=args.min_track, num_failed_det=args.num_failed_det
    )
    instrumented = track_shot_instrumented(
        synthetic, min_track=args.min_track, num_failed_det=args.num_failed_det
    )

    assert len(original) == len(instrumented), "Track count mismatch"
    for i, (a, b) in enumerate(zip(original, instrumented)):
        assert np.array_equal(a["frame"], b["frame"]), f"Frame mismatch in track {i}"
        assert np.allclose(a["bbox"], b["bbox"]), f"BBox mismatch in track {i}"

    print("Production equivalence: PASS")
    print(f"Tracks retained: {len(original)}")
    print("\\nSynthetic tracking metrics:")
    for key, value in compute_metrics(synthetic, instrumented).items():
        print(f"{key}: {value:.4f}" if isinstance(value, float) else f"{key}: {value}")
    print("\\nSynthetic raw vs median-smoothed crop coordinates:")
    for key, value in compare_raw_vs_smoothed(original).items():
        print(f"{key}: mean absolute change={value['mean_absolute_change']:.4f}, max absolute change={value['max_absolute_change']:.4f}")
    print("\\nNOTE: Synthetic validation only; no real video data was evaluated.")
    return 0

if __name__ == "__main__":
    sys.exit(main())

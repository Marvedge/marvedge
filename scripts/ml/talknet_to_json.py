"""
talknet_to_json.py
------------------
Task 00011: Structure TalkNet's output into a clean JSON schema.

After running demoTalkNet.py, this script reads the saved track and score
pickle files from the pywork/ directory and writes a single, structured
speaking_results.json file with the following schema per frame:

    {
      "metadata": { "video": ..., "fps": 25, "total_frames": ..., ... },
      "speakers": [
        {
          "speaker_id": "00000",
          "start_frame":  42,
          "end_frame":   310,
          "start_time_sec": 1.68,
          "end_time_sec":  12.40,
          "frames": [
            {
              "frame":               42,
              "timestamp_sec":       1.68,
              "speaking_probability": 0.93,
              "is_speaking":         true,
              "bbox":                [120, 45, 280, 210]
            },
            ...
          ]
        }
      ]
    }

Usage:
    python talknet_to_json.py \\
        --saveDir demo/test_clip \\
        --fps 25 \\
        --threshold 0.0 \\
        --output speaking_results.json

Arguments:
    --saveDir     Path to TalkNet's output directory (contains pywork/, pycrop/, etc.)
    --fps         Frames-per-second of the source video (default: 25)
    --threshold   Speaking probability threshold above which is_speaking = true (default: 0.0)
    --output      Output JSON filename relative to --saveDir (default: speaking_results.json)
"""

import os
import sys
import json
import pickle
import argparse
import datetime
import glob

import numpy


# ─── Smoothing (mirrors TalkNet's visualization smoothing window of ±2) ───────
SMOOTHING_WINDOW = 2


def smooth_scores(scores: numpy.ndarray, window: int = SMOOTHING_WINDOW) -> list:
    """Apply ±window frame averaging to speaking probabilities."""
    smoothed = []
    for i in range(len(scores)):
        lo = max(0, i - window)
        hi = min(len(scores) - 1, i + window + 1)
        smoothed.append(float(numpy.mean(scores[lo:hi])))
    return smoothed


def load_tracks(pywork_dir: str) -> list:
    """Load vidTracks from pywork/tracks.pckl."""
    path = os.path.join(pywork_dir, "tracks.pckl")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"tracks.pckl not found in {pywork_dir}. "
            "Run demoTalkNet.py (or preprocess_faces.py) first."
        )
    with open(path, "rb") as f:
        return pickle.load(f)


def load_scores(pywork_dir: str, n_tracks: int) -> list:
    """
    Load per-track speaking scores from pywork/scores.pckl.
    Falls back to individual per-track pckl files if scores.pckl is absent.
    Returns a list of numpy arrays, one per track.
    """
    # Primary: TalkNet saves all scores together
    bulk_path = os.path.join(pywork_dir, "scores.pckl")
    if os.path.exists(bulk_path):
        with open(bulk_path, "rb") as f:
            scores = pickle.load(f)
        if len(scores) == n_tracks:
            return [numpy.array(s) for s in scores]

    # Fallback: individual files named 00000.pckl, 00001.pckl, ...
    scores = []
    for ii in range(n_tracks):
        p = os.path.join(pywork_dir, "%05d.pckl" % ii)
        if os.path.exists(p):
            with open(p, "rb") as f:
                scores.append(numpy.array(pickle.load(f)))
        else:
            sys.stderr.write(
                f"[WARN] No score file for track {ii:05d}, filling with zeros.\n"
            )
            # Use 0-probability (unknown) if scores are missing
            n_frames = len(tracks[ii]["track"]["frame"])
            scores.append(numpy.zeros(n_frames))

    return scores


def build_json(tracks: list, scores: list, fps: float, threshold: float,
               save_dir: str, video_name: str) -> dict:
    """Construct the full structured JSON output."""

    all_frames = []
    for t in tracks:
        all_frames.extend(t["track"]["frame"].tolist())
    total_frames = max(all_frames) + 1 if all_frames else 0
    duration_sec = round(total_frames / fps, 3)

    output = {
        "metadata": {
            "video":        video_name,
            "save_dir":     os.path.abspath(save_dir),
            "fps":          fps,
            "total_frames": total_frames,
            "duration_sec": duration_sec,
            "threshold":    threshold,
            "generated_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "smoothing_window_frames": SMOOTHING_WINDOW,
            "score_type":   "sigmoid_probability"
        },
        "speakers": []
    }

    for ii, (track, raw_scores) in enumerate(zip(tracks, scores)):
        frames_arr  = track["track"]["frame"]       # numpy array of frame indices
        bboxes_arr  = track["track"]["bbox"]         # numpy array of [x1,y1,x2,y2]
        proc        = track.get("proc_track", {})   # smoothed centroid data

        raw_scores  = numpy.array(raw_scores, dtype=float)
        # Pad or truncate scores to match frame count (safety guard)
        n_frames    = len(frames_arr)
        if len(raw_scores) < n_frames:
            raw_scores = numpy.pad(raw_scores, (0, n_frames - len(raw_scores)))
        elif len(raw_scores) > n_frames:
            raw_scores = raw_scores[:n_frames]

        smoothed    = smooth_scores(raw_scores)

        start_frame = int(frames_arr[0])
        end_frame   = int(frames_arr[-1])

        frame_records = []
        for fidx in range(n_frames):
            abs_frame   = int(frames_arr[fidx])
            timestamp   = round(abs_frame / fps, 4)
            
            # TalkNet outputs raw logits. Convert to a true [0, 1] probability via Sigmoid.
            raw_logit   = smoothed[fidx]
            prob        = round(float(1 / (1 + numpy.exp(-numpy.clip(raw_logit, -15, 15)))), 4)
            
            bbox        = [round(float(v), 2) for v in bboxes_arr[fidx]]

            frame_records.append({
                "frame":                abs_frame,
                "timestamp_sec":        timestamp,
                "speaking_probability": prob,
                "is_speaking":          prob > threshold,
                "bbox":                 bbox,   # [x1, y1, x2, y2] in original frame coords
            })

        output["speakers"].append({
            "speaker_id":     "%05d" % ii,
            "start_frame":    start_frame,
            "end_frame":      end_frame,
            "start_time_sec": round(start_frame / fps, 4),
            "end_time_sec":   round(end_frame   / fps, 4),
            "frames":         frame_records,
        })

    return output


def main():
    parser = argparse.ArgumentParser(
        description="Structure TalkNet output into clean JSON (Task 00011)"
    )
    parser.add_argument("--saveDir",   required=True,
                        help="TalkNet save directory (contains pywork/, pycrop/, ...)")
    parser.add_argument("--fps",       type=float, default=25.0,
                        help="Source video FPS (default: 25)")
    parser.add_argument("--threshold", type=float, default=0.5,
                        help="Speaking probability threshold for is_speaking flag (default: 0.5)")
    parser.add_argument("--output",    type=str, default="speaking_results.json",
                        help="Output filename relative to --saveDir (default: speaking_results.json)")
    args = parser.parse_args()

    pywork_dir  = os.path.join(args.saveDir, "pywork")
    video_name  = os.path.basename(args.saveDir.rstrip("/"))
    output_path = os.path.join(args.saveDir, args.output)

    print(f"\n{'='*60}")
    print(f"  TalkNet JSON Structurer  —  Task 00011")
    print(f"  Save dir:   {args.saveDir}")
    print(f"  FPS:        {args.fps}")
    print(f"  Threshold:  {args.threshold}")
    print(f"{'='*60}")

    global tracks
    tracks = load_tracks(pywork_dir)
    print(f"\n✓ Loaded {len(tracks)} tracks from tracks.pckl")

    scores = load_scores(pywork_dir, len(tracks))
    print(f"✓ Loaded {len(scores)} score arrays")

    result = build_json(tracks, scores, args.fps, args.threshold,
                        args.saveDir, video_name)

    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)

    n_speakers     = len(result["speakers"])
    total_frames   = sum(len(s["frames"]) for s in result["speakers"])
    speaking_pct   = (
        100.0 * sum(
            1 for s in result["speakers"] for fr in s["frames"] if fr["is_speaking"]
        ) / total_frames
        if total_frames else 0
    )

    print(f"\n{'='*60}")
    print(f"  Output written → {output_path}")
    print(f"  Speakers:        {n_speakers}")
    print(f"  Total frames:    {total_frames}")
    print(f"  Speaking frames: {speaking_pct:.1f}%")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()

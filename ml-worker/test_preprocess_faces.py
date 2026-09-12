"""
test_preprocess_faces.py
------------------------
Automated validation suite for the output of preprocess_faces.py.

Run this in Colab Cell 7 after preprocessing completes, or locally:
    python test_preprocess_faces.py --outputDir demo/preprocessing_output

It validates:
  1. Directory structure  - all expected folders exist
  2. metadata.json schema - correct keys, valid types, sane ranges
  3. Video integrity      - each .avi opens, has frames, is 224x224
  4. Audio integrity      - each .wav exists, is 16kHz mono
  5. Timestamp coherence  - start < end, times match frame numbers
  6. Cross-file coverage  - every track in metadata has a matching .avi and .wav
"""

import os
import sys
import json
import wave
import glob
import argparse
import cv2


# ─── ANSI colours for output ─────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
RESET  = "\033[0m"

PASS = f"{GREEN}PASS{RESET}"
FAIL = f"{RED}FAIL{RESET}"
WARN = f"{YELLOW}WARN{RESET}"

results = {"pass": 0, "fail": 0, "warn": 0}


def check(label, condition, reason="", warning=False):
    """Record a single test result."""
    if condition:
        print(f"  [{PASS}] {label}")
        results["pass"] += 1
    elif warning:
        print(f"  [{WARN}] {label}  — {reason}")
        results["warn"] += 1
    else:
        print(f"  [{FAIL}] {label}  — {reason}")
        results["fail"] += 1


# ─── Test 1: Directory structure ─────────────────────────────────────────────
def test_directory_structure(output_dir):
    print("\n📁 Test 1: Directory Structure")
    for subdir in ["pyavi", "pyframes", "pywork", "pycrop"]:
        path = os.path.join(output_dir, subdir)
        check(f"{subdir}/ exists", os.path.isdir(path),
              f"{path} not found")

    check("metadata.json exists",
          os.path.isfile(os.path.join(output_dir, "metadata.json")),
          "metadata.json not found")

    check("pyavi/video.avi exists",
          os.path.isfile(os.path.join(output_dir, "pyavi", "video.avi")),
          "Extracted video missing")

    check("pyavi/audio.wav exists",
          os.path.isfile(os.path.join(output_dir, "pyavi", "audio.wav")),
          "Extracted audio missing")

    frames = glob.glob(os.path.join(output_dir, "pyframes", "*.jpg"))
    check("pyframes/ contains .jpg files", len(frames) > 0,
          "No frames extracted")
    if frames:
        print(f"          → {len(frames)} frames found")


# ─── Test 2: metadata.json schema ────────────────────────────────────────────
def test_metadata_schema(output_dir):
    print("\n📋 Test 2: metadata.json Schema")
    meta_path = os.path.join(output_dir, "metadata.json")

    try:
        with open(meta_path) as f:
            meta = json.load(f)
    except Exception as e:
        check("metadata.json is valid JSON", False, str(e))
        return None

    check("metadata.json is valid JSON", True)
    check("'tracks' key exists", "tracks" in meta,
          "Root 'tracks' key missing")

    if "tracks" not in meta:
        return None

    tracks = meta["tracks"]
    check("At least 1 track found", len(tracks) > 0, "0 tracks in metadata")
    print(f"          → {len(tracks)} tracks found")

    required_keys = ["track_id", "start_frame", "end_frame",
                     "start_time_sec", "end_time_sec",
                     "video_path", "audio_path", "bbox_history"]

    for i, track in enumerate(tracks):
        tid = track.get("track_id", f"index_{i}")
        for key in required_keys:
            check(f"Track {tid}: has '{key}'", key in track,
                  f"Missing key '{key}'")

        if all(k in track for k in ["start_frame", "end_frame",
                                     "start_time_sec", "end_time_sec"]):
            check(f"Track {tid}: start < end (frames)",
                  track["start_frame"] < track["end_frame"],
                  f"start_frame {track['start_frame']} >= end_frame {track['end_frame']}")

            check(f"Track {tid}: start < end (secs)",
                  track["start_time_sec"] < track["end_time_sec"],
                  f"start_time {track['start_time_sec']} >= end_time {track['end_time_sec']}")

            # Verify timestamps match frame numbers (25 fps)
            expected_start_sec = round(track["start_frame"] / 25.0, 2)
            actual_start_sec   = round(track["start_time_sec"], 2)
            check(f"Track {tid}: start_time_sec matches start_frame / 25",
                  abs(expected_start_sec - actual_start_sec) < 0.05,
                  f"expected {expected_start_sec}, got {actual_start_sec}")

        if "bbox_history" in track:
            check(f"Track {tid}: bbox_history non-empty",
                  len(track["bbox_history"]) > 0,
                  "bbox_history is empty")
            if track["bbox_history"]:
                first_bbox = track["bbox_history"][0].get("bbox", [])
                check(f"Track {tid}: bbox has 4 coords",
                      len(first_bbox) == 4,
                      f"Expected 4 coords, got {len(first_bbox)}")
                check(f"Track {tid}: bbox x1 < x2 and y1 < y2",
                      first_bbox[0] < first_bbox[2] and first_bbox[1] < first_bbox[3],
                      f"Degenerate bbox: {first_bbox}")

    return tracks


# ─── Test 3: Cropped video integrity ─────────────────────────────────────────
def test_video_crops(output_dir, tracks):
    print("\n🎬 Test 3: Cropped Video Integrity (pycrop/*.avi)")
    crop_dir = os.path.join(output_dir, "pycrop")
    avi_files = sorted(glob.glob(os.path.join(crop_dir, "*.avi")))

    check("At least 1 .avi crop file exists", len(avi_files) > 0,
          f"No .avi files in {crop_dir}")
    print(f"          → {len(avi_files)} .avi files found")

    if tracks:
        check("Number of .avi files matches track count",
              len(avi_files) == len(tracks),
              f"{len(avi_files)} .avi files vs {len(tracks)} tracks in metadata",
              warning=True)

    for avi_path in avi_files:
        name = os.path.basename(avi_path)
        cap = cv2.VideoCapture(avi_path)
        check(f"{name}: opens successfully", cap.isOpened(),
              "cv2 could not open file")

        if cap.isOpened():
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS)

            check(f"{name}: dimensions are 224×224",
                  w == 224 and h == 224,
                  f"Got {w}×{h} instead of 224×224")

            check(f"{name}: fps is 25",
                  abs(fps - 25.0) < 1.0,
                  f"Got {fps:.1f} fps")

            check(f"{name}: has frames",
                  frame_count > 0,
                  "frame_count = 0")
            cap.release()


# ─── Test 4: Audio integrity ─────────────────────────────────────────────────
def test_audio_crops(output_dir):
    print("\n🔊 Test 4: Cropped Audio Integrity (pycrop/*.wav)")
    crop_dir = os.path.join(output_dir, "pycrop")
    wav_files = sorted(glob.glob(os.path.join(crop_dir, "*.wav")))

    check("At least 1 .wav crop file exists", len(wav_files) > 0,
          f"No .wav files in {crop_dir}")
    print(f"          → {len(wav_files)} .wav files found")

    for wav_path in wav_files:
        name = os.path.basename(wav_path)
        try:
            with wave.open(wav_path, 'r') as wf:
                sample_rate   = wf.getframerate()
                num_channels  = wf.getnchannels()
                num_frames    = wf.getnframes()

            check(f"{name}: sample rate is 16000 Hz",
                  sample_rate == 16000,
                  f"Got {sample_rate} Hz")

            check(f"{name}: mono (1 channel)",
                  num_channels == 1,
                  f"Got {num_channels} channels")

            check(f"{name}: non-empty",
                  num_frames > 0,
                  "0 audio frames")
        except Exception as e:
            check(f"{name}: can be read", False, str(e))


# ─── Test 5: Cross-file coverage ─────────────────────────────────────────────
def test_cross_file_coverage(output_dir, tracks):
    print("\n🔗 Test 5: Cross-File Coverage (metadata ↔ disk)")
    if not tracks:
        print("   Skipped — no tracks loaded from metadata")
        return

    crop_dir = os.path.join(output_dir, "pycrop")
    for track in tracks:
        tid = track.get("track_id", "?")
        avi = os.path.join(crop_dir, track.get("video_path", ""))
        wav = os.path.join(crop_dir, track.get("audio_path", ""))

        check(f"Track {tid}: {track.get('video_path')} exists on disk",
              os.path.isfile(avi), f"Not found: {avi}")

        check(f"Track {tid}: {track.get('audio_path')} exists on disk",
              os.path.isfile(wav), f"Not found: {wav}")


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Validate output of preprocess_faces.py"
    )
    parser.add_argument("--outputDir", required=True,
                        help="Path to the preprocessing output directory")
    args = parser.parse_args()

    output_dir = args.outputDir
    print(f"\n{'='*60}")
    print(f"  TalkNet Preprocessing Validation Suite")
    print(f"  Output dir: {output_dir}")
    print(f"{'='*60}")

    test_directory_structure(output_dir)
    tracks = test_metadata_schema(output_dir)
    test_video_crops(output_dir, tracks)
    test_audio_crops(output_dir)
    test_cross_file_coverage(output_dir, tracks)

    # ── Summary ──────────────────────────────────────────────────────────────
    total = results["pass"] + results["fail"] + results["warn"]
    print(f"\n{'='*60}")
    print(f"  Results: {results['pass']}/{total} passed  |  "
          f"{results['fail']} failed  |  {results['warn']} warnings")
    print(f"{'='*60}\n")

    if results["fail"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

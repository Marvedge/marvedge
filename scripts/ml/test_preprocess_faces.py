"""
test_preprocess_faces.py
------------------------
Automated validation and unit test suite for TalkNet face-crop preprocessing
(preprocess_faces.py and benchmark_preprocessing.py).

Features:
  1. Directory structure & file existence
  2. metadata.json schema & timestamp coherence (with TARGET_FPS = 25)
  3. Video integrity (pycrop/*.avi dimensions 224x224, 25 fps)
  4. Audio integrity (pycrop/*.wav 16kHz mono)
  5. Cross-file coverage (metadata matches disk artifacts)
  6. Multi-speaker characteristics (no duplicate frames, separate tracks, identity separation)
  7. Standalone unit test suite for tracking logic:
     - ZeroDivisionError guard on degenerate/identical boxes
     - Multi-target tracking with concurrent/two-speaker scenarios
     - Interpolation across missed frames without identity hopping
     - interp1d stability on single-detection/short tracks

Usage:
  # Validate preprocessed output directory:
  python test_preprocess_faces.py --outputDir demo/preprocessing_output

  # Validate multi-speaker sample (asserting >= 2 tracks):
  python test_preprocess_faces.py --outputDir demo/preprocessing_output --minSpeakers 2

  # Run standalone unit test suite for edge-case tracking logic:
  python test_preprocess_faces.py --unit
"""

import os
import sys
import json
import wave
import glob
import argparse
import cv2
import numpy

# Add script directory to sys.path so preprocess_faces can be imported
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

TARGET_FPS = 25

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

            # Verify timestamps match frame numbers using TARGET_FPS
            expected_start_sec = round(track["start_frame"] / float(TARGET_FPS), 2)
            actual_start_sec   = round(track["start_time_sec"], 2)
            check(f"Track {tid}: start_time_sec matches start_frame / {TARGET_FPS}",
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

            check(f"{name}: fps is {TARGET_FPS}",
                  abs(fps - float(TARGET_FPS)) < 1.0,
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


# ─── Test 6: Multi-Speaker Characteristics ───────────────────────────────────
def test_multispeaker_characteristics(output_dir, tracks, min_speakers=1):
    print("\n👥 Test 6: Multi-Speaker Tracking Validation")
    if not tracks:
        print("   Skipped — no tracks loaded")
        return

    track_ids = [t.get("track_id") for t in tracks]
    check("All track IDs are unique", len(track_ids) == len(set(track_ids)),
          f"Duplicate track IDs found: {track_ids}")

    if min_speakers > 1:
        check(f"Identified >= {min_speakers} tracks for multi-speaker input",
              len(tracks) >= min_speakers,
              f"Expected >= {min_speakers} tracks, got {len(tracks)}")

    for track in tracks:
        tid = track.get("track_id", "?")
        history = track.get("bbox_history", [])
        if not history:
            continue

        frames = [entry["frame"] for entry in history]
        is_strictly_increasing = all(frames[k] < frames[k+1] for k in range(len(frames) - 1))
        check(f"Track {tid}: frames are strictly monotonically increasing (no duplicates)",
              is_strictly_increasing,
              f"Frame sequence has duplicates or reversals: {frames[:10]}...")

        # Verify frame range matches start/end
        expected_len = track.get("end_frame", 0) - track.get("start_frame", 0) + 1
        check(f"Track {tid}: bbox history length matches (end - start + 1)",
              len(history) == expected_len,
              f"History length {len(history)} != expected {expected_len}")

    # Check temporal overlap without spatial collision (two distinct speakers)
    from preprocess_faces import bb_intersection_over_union
    for i in range(len(tracks)):
        for j in range(i + 1, len(tracks)):
            t1 = tracks[i]
            t2 = tracks[j]
            t1_frames = {e["frame"]: e["bbox"] for e in t1.get("bbox_history", [])}
            t2_frames = {e["frame"]: e["bbox"] for e in t2.get("bbox_history", [])}

            common_frames = set(t1_frames.keys()) & set(t2_frames.keys())
            if common_frames:
                # Concurrent frames exist: verify tracks are distinct speakers (not duplicated tracks)
                high_overlap_count = 0
                for f in common_frames:
                    iou = bb_intersection_over_union(t1_frames[f], t2_frames[f])
                    if iou > 0.8:
                        high_overlap_count += 1

                overlap_ratio = high_overlap_count / float(len(common_frames))
                check(f"Tracks {t1['track_id']} & {t2['track_id']}: distinct spatial identities (overlap ratio {overlap_ratio:.2f} <= 0.5)",
                      overlap_ratio <= 0.5,
                      f"Tracks have {overlap_ratio*100:.1f}% high-overlap frames — potential duplicate track")


# ─── Unit Test Suite: Tracking & Preprocessing Logic ─────────────────────────
def run_unit_tests():
    print(f"\n{'='*60}")
    print("  TalkNet Face-Crop Preprocessing Unit Test Suite")
    print(f"{'='*60}")

    from preprocess_faces import bb_intersection_over_union, track_shot

    class MockArgs:
        def __init__(self):
            self.numFailedDet = 10
            self.minTrack = 10
            self.minFaceSize = 1
            self.cropScale = 0.40

    args = MockArgs()

    # --- Unit Test 1: IoU Edge Cases & ZeroDivisionError ---
    print("\n📐 Unit Test 1: bb_intersection_over_union edge cases")
    # Standard overlapping
    iou_std = bb_intersection_over_union([0, 0, 10, 10], [5, 5, 15, 15])
    check("Standard boxes IoU in (0, 1)", 0.0 < iou_std < 1.0, f"Got {iou_std}")

    # Identical boxes
    iou_ident = bb_intersection_over_union([10, 10, 50, 50], [10, 10, 50, 50])
    check("Identical boxes IoU == 1.0", abs(iou_ident - 1.0) < 1e-6, f"Got {iou_ident}")

    # Non-overlapping
    iou_disjoint = bb_intersection_over_union([0, 0, 10, 10], [100, 100, 110, 110])
    check("Disjoint boxes IoU == 0.0", iou_disjoint == 0.0, f"Got {iou_disjoint}")

    # Degenerate zero-area boxes (ZeroDivisionError regression check)
    try:
        iou_zero = bb_intersection_over_union([10, 10, 10, 10], [10, 10, 10, 10])
        check("Zero-area boxes return 0.0 without ZeroDivisionError", iou_zero == 0.0, f"Got {iou_zero}")
    except ZeroDivisionError as e:
        check("Zero-area boxes return 0.0 without ZeroDivisionError", False, str(e))

    # Inverted coordinates
    try:
        iou_inv = bb_intersection_over_union([50, 50, 10, 10], [50, 50, 10, 10])
        check("Inverted boxes return 0.0 safely", iou_inv == 0.0, f"Got {iou_inv}")
    except Exception as e:
        check("Inverted boxes return 0.0 safely", False, str(e))

    # --- Unit Test 2: Multi-Speaker Concurrent Tracking ---
    print("\n👥 Unit Test 2: track_shot with two concurrent speakers")
    num_frames = 30
    scene_faces = []
    for f in range(num_frames):
        # Speaker 1 on left side, Speaker 2 on right side
        spk1 = {'frame': f, 'bbox': [100.0 + f * 0.2, 100.0, 200.0 + f * 0.2, 200.0], 'conf': 0.98}
        spk2 = {'frame': f, 'bbox': [600.0 - f * 0.2, 100.0, 700.0 - f * 0.2, 200.0], 'conf': 0.95}
        scene_faces.append([spk1, spk2])

    tracks = track_shot(args, scene_faces)
    check("Detected exactly 2 tracks for two concurrent speakers", len(tracks) == 2,
          f"Expected 2 tracks, got {len(tracks)}")

    if len(tracks) == 2:
        t0, t1 = tracks[0], tracks[1]
        check("Track 0 has full 30 frames", len(t0['frame']) == num_frames, f"Got {len(t0['frame'])}")
        check("Track 1 has full 30 frames", len(t1['frame']) == num_frames, f"Got {len(t1['frame'])}")

        # Check speaker separation
        t0_x_mean = numpy.mean(t0['bbox'][:, 0])
        t1_x_mean = numpy.mean(t1['bbox'][:, 0])
        check("Tracks are spatially separated (left speaker vs right speaker)",
              abs(t0_x_mean - t1_x_mean) > 300,
              f"Means are too close: {t0_x_mean} vs {t1_x_mean}")

    # --- Unit Test 3: Missing Frame Interpolation ---
    print("\n🔍 Unit Test 3: track_shot interpolates across missed detection")
    scene_missing = []
    for f in range(25):
        if f == 12:
            # Dropped detection on frame 12
            scene_missing.append([])
        else:
            scene_missing.append([{'frame': f, 'bbox': [150.0, 150.0, 250.0, 250.0], 'conf': 0.96}])

    tracks_missing = track_shot(args, scene_missing)
    check("Single track recovered despite missed frame 12", len(tracks_missing) == 1,
          f"Got {len(tracks_missing)} tracks")
    if len(tracks_missing) == 1:
        t = tracks_missing[0]
        check("Track has all 25 frames (0..24) interpolated", len(t['frame']) == 25,
              f"Expected 25 frames, got {len(t['frame'])}")
        check("Frame 12 is present in interpolated track", 12 in t['frame'],
              "Frame 12 missing from interpolated track")

    # --- Unit Test 4: Single-detection track interp1d guard ---
    print("\n🛡️ Unit Test 4: track_shot single-detection interp1d crash guard")
    scene_single = [[{'frame': 0, 'bbox': [100.0, 100.0, 200.0, 200.0], 'conf': 0.9}]]
    try:
        args_zero_min = MockArgs()
        args_zero_min.minTrack = 0  # Force attempt on single detection
        tracks_single = track_shot(args_zero_min, scene_single)
        check("Single-detection track does not crash interp1d", True)
    except Exception as e:
        check("Single-detection track does not crash interp1d", False, str(e))

    # --- Unit Test 5: Filtering short tracks (< minTrack) ---
    print("\n🧹 Unit Test 5: Filter tracks shorter than minTrack")
    scene_short = []
    for f in range(5):
        scene_short.append([{'frame': f, 'bbox': [100.0, 100.0, 200.0, 200.0], 'conf': 0.9}])
    tracks_short = track_shot(args, scene_short)
    check("5-frame track filtered out when minTrack=10", len(tracks_short) == 0,
          f"Expected 0 tracks, got {len(tracks_short)}")


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Validate output of TalkNet face preprocessing or run unit tests"
    )
    parser.add_argument("--outputDir", default=None,
                        help="Path to the preprocessing output directory")
    parser.add_argument("--minSpeakers", type=int, default=1,
                        help="Minimum number of speakers expected (default: 1)")
    parser.add_argument("--unit", action="store_true",
                        help="Run the unit test suite for preprocessing and tracking logic")
    args = parser.parse_args()

    # If no outputDir specified or --unit explicitly passed, run unit tests
    if args.unit or args.outputDir is None:
        run_unit_tests()

    # If outputDir specified, run directory validation tests
    if args.outputDir is not None:
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
        test_multispeaker_characteristics(output_dir, tracks, min_speakers=args.minSpeakers)

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

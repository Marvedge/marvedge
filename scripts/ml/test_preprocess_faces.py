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

    # ── Task-00043: Fallback unit tests ─────────────────────────────────────

    # Lazy-import to avoid requiring ML deps in unit mode
    try:
        from preprocess_faces import center_crop_fallback
        HAS_FALLBACK = True
    except ImportError:
        HAS_FALLBACK = False
        print(f"  {WARN} center_crop_fallback not importable — skipping fallback tests")

    if HAS_FALLBACK:
        # --- Fallback Test 1: Zero detections → exactly 1 fallback track ---
        print("\n🛡️  Fallback Test 1: zero detections produces exactly 1 fallback track")
        import tempfile, shutil
        tmp_dir = tempfile.mkdtemp()
        args_fb = MockArgs()
        args_fb.pyframesPath = tmp_dir   # empty dir, no frames → default resolution
        args_fb.minTrack = 10

        fb_track = center_crop_fallback(args_fb, 0, 100)
        check("Fallback track is not None for 100-frame scene", fb_track is not None)
        if fb_track is not None:
            check("is_fallback flag is True",
                  fb_track.get('is_fallback') is True,
                  f"Got is_fallback={fb_track.get('is_fallback')}")
            check("fallback_reason is 'no_face_detected'",
                  fb_track.get('fallback_reason') == 'no_face_detected',
                  f"Got fallback_reason={fb_track.get('fallback_reason')}")
            check("Fallback bbox has correct shape (100, 4)",
                  fb_track['bbox'].shape == (100, 4),
                  f"Got shape {fb_track['bbox'].shape}")
            check("Fallback frames span [0, 99]",
                  int(fb_track['frame'][0]) == 0 and int(fb_track['frame'][-1]) == 99,
                  f"Got [{fb_track['frame'][0]}, {fb_track['frame'][-1]}]")
        shutil.rmtree(tmp_dir, ignore_errors=True)

        # --- Fallback Test 2: Scene shorter than minTrack → returns None ---
        print("\n🛡️  Fallback Test 2: scene shorter than minTrack returns None")
        tmp_dir2 = tempfile.mkdtemp()
        args_fb2 = MockArgs()
        args_fb2.pyframesPath = tmp_dir2
        args_fb2.minTrack = 10

        fb_short = center_crop_fallback(args_fb2, 0, 5)  # only 5 frames < minTrack=10
        check("center_crop_fallback returns None for 5-frame scene", fb_short is None,
              f"Expected None, got {fb_short}")
        shutil.rmtree(tmp_dir2, ignore_errors=True)

        # --- Fallback Test 3: Real-face scene NOT tagged as fallback ---
        print("\n🛡️  Fallback Test 3: real-face tracks are tagged is_fallback=False")
        scene_real = []
        for f in range(25):
            scene_real.append([{'frame': f, 'bbox': [100.0, 100.0, 200.0, 200.0], 'conf': 0.95}])
        tracks_real = track_shot(args, scene_real)
        if tracks_real:
            check("Real face track has is_fallback=False",
                  tracks_real[0].get('is_fallback') is False,
                  f"Got is_fallback={tracks_real[0].get('is_fallback')}")
            check("Real face track has fallback_reason=None",
                  tracks_real[0].get('fallback_reason') is None,
                  f"Got fallback_reason={tracks_real[0].get('fallback_reason')}")
        else:
            check("Real face track present to test fallback tag", False, "No real tracks returned")

        # --- Fallback Test 4: Degenerate bbox (width=0) does not crash fallback ---
        print("\n🛡️  Fallback Test 4: degenerate bbox in crop_video does not crash")
        scene_degenerate = [
            [{'frame': f, 'bbox': [100.0, 100.0, 100.0, 100.0], 'conf': 0.9}]
            for f in range(25)
        ]
        try:
            _ = track_shot(args, scene_degenerate)
            # Tracks with zero-area bbox will be filtered by minFaceSize; that is correct.
            check("Degenerate-bbox scene does not crash track_shot", True)
        except Exception as e:
            check("Degenerate-bbox scene does not crash track_shot", False, str(e))


    # ═══════════════════════════════════════════════════════════════════════════
    # Task-00088: Final accuracy tuning — production edge cases
    # Edge cases: multiple speakers, no face visible, static slides
    # ═══════════════════════════════════════════════════════════════════════════

    # --- EC-1 (Multi-Speaker): Three concurrent speakers ---
    print("\n\U0001f465 EC-1 (Multi-Speaker): Three concurrent speakers tracked independently")
    scene_3spk = []
    for f in range(30):
        spk1 = {'frame': f, 'bbox': [50.0,  100.0, 150.0, 200.0], 'conf': 0.98}
        spk2 = {'frame': f, 'bbox': [350.0, 100.0, 450.0, 200.0], 'conf': 0.96}
        spk3 = {'frame': f, 'bbox': [650.0, 100.0, 750.0, 200.0], 'conf': 0.94}
        scene_3spk.append([spk1, spk2, spk3])
    tracks_3spk = track_shot(args, scene_3spk)
    check("EC-1: Three concurrent speakers => exactly 3 tracks",
          len(tracks_3spk) == 3, f"Got {len(tracks_3spk)}")
    if len(tracks_3spk) == 3:
        x_means = sorted([numpy.mean(t['bbox'][:, 0]) for t in tracks_3spk])
        check("EC-1: Three tracks spatially ordered left-to-right",
              x_means[1] - x_means[0] > 150 and x_means[2] - x_means[1] > 150,
              f"x_means={x_means}")

    # --- EC-2 (Multi-Speaker): Second speaker enters mid-shot ---
    print("\n\U0001f465 EC-2 (Multi-Speaker): Second speaker enters mid-shot")
    args_ec2 = MockArgs()
    args_ec2.numFailedDet = 10
    args_ec2.minTrack = 5
    args_ec2.minFaceSize = 1
    args_ec2.cropScale = 0.40
    scene_enter = []
    for f in range(20):
        spk1 = {'frame': f, 'bbox': [100.0, 100.0, 200.0, 200.0], 'conf': 0.98}
        if f >= 10:
            spk2 = {'frame': f, 'bbox': [600.0, 100.0, 700.0, 200.0], 'conf': 0.95}
            scene_enter.append([spk1, spk2])
        else:
            scene_enter.append([spk1])
    tracks_enter = track_shot(args_ec2, scene_enter)
    check("EC-2: Speaker 1 keeps long track after speaker 2 enters",
          any(len(t['frame']) >= 15 for t in tracks_enter),
          f"Frame lengths: {[len(t['frame']) for t in tracks_enter]}")
    check("EC-2: Second speaker gets its own track",
          len(tracks_enter) >= 2, f"Expected >=2 tracks, got {len(tracks_enter)}")

    # --- EC-3 (Multi-Speaker): Adjacent speakers with IoU=0 do not merge ---
    print("\n\U0001f465 EC-3 (Multi-Speaker): Adjacent speakers (IoU=0) do not merge")
    scene_prox = []
    for f in range(30):
        spk1 = {'frame': f, 'bbox': [100.0, 100.0, 200.0, 200.0], 'conf': 0.98}
        spk2 = {'frame': f, 'bbox': [210.0, 100.0, 310.0, 200.0], 'conf': 0.95}
        scene_prox.append([spk1, spk2])
    tracks_prox = track_shot(args, scene_prox)
    check("EC-3: Adjacent speakers (IoU=0) => 2 distinct tracks",
          len(tracks_prox) == 2, f"Expected 2 tracks, got {len(tracks_prox)}")

    # --- EC-4 (Multi-Speaker): Speaker briefly absent then re-enters ---
    print("\n\U0001f465 EC-4 (Multi-Speaker): Speaker absent 4 frames within numFailedDet=5")
    args_ec4 = MockArgs()
    args_ec4.numFailedDet = 5
    args_ec4.minTrack = 5
    args_ec4.minFaceSize = 1
    args_ec4.cropScale = 0.40
    scene_reenter = []
    for f in range(30):
        if 10 <= f <= 13:
            scene_reenter.append([])
        else:
            scene_reenter.append([{'frame': f, 'bbox': [100.0, 100.0, 200.0, 200.0], 'conf': 0.97}])
    tracks_reenter = track_shot(args_ec4, scene_reenter)
    total_fr = sum(len(t['frame']) for t in tracks_reenter)
    check("EC-4: Re-entering speaker => >=1 track with >=20 frames",
          len(tracks_reenter) >= 1 and total_fr >= 20,
          f"{len(tracks_reenter)} tracks, {total_fr} total frames")

    # --- EC-5 (No Face): Entire 500-frame video has zero detections ---
    print("\n\U0001f636 EC-5 (No Face): 500-frame all-empty => full fallback track")
    try:
        from preprocess_faces import center_crop_fallback
        import tempfile as _tf
        import shutil as _sh
        _tmp = _tf.mkdtemp()
        args_ec5 = MockArgs()
        args_ec5.pyframesPath = _tmp
        args_ec5.minTrack = 10
        fb500 = center_crop_fallback(args_ec5, 0, 500)
        check("EC-5: 500-frame no-face => fallback not None", fb500 is not None)
        if fb500 is not None:
            check("EC-5: fallback spans 500 frames",
                  len(fb500['frame']) == 500, f"Got {len(fb500['frame'])}")
            check("EC-5: fallback bbox shape is (500, 4)",
                  fb500['bbox'].shape == (500, 4), f"Got {fb500['bbox'].shape}")
            check("EC-5: fallback_reason == 'no_face_detected'",
                  fb500.get('fallback_reason') == 'no_face_detected',
                  f"Got '{fb500.get('fallback_reason')}'")
        _sh.rmtree(_tmp, ignore_errors=True)
    except ImportError:
        check("EC-5: center_crop_fallback importable", False, "ImportError")

    # --- EC-6 (No Face): Faces vanish mid-shot, track retained via numFailedDet ---
    print("\n\U0001f636 EC-6 (No Face): Faces vanish mid-shot, track stays open")
    args_ec6 = MockArgs()
    args_ec6.numFailedDet = 50
    args_ec6.minTrack = 5
    args_ec6.minFaceSize = 1
    args_ec6.cropScale = 0.40
    scene_partial = []
    for f in range(30):
        if f < 15:
            scene_partial.append([{'frame': f, 'bbox': [100.0, 100.0, 200.0, 200.0], 'conf': 0.95}])
        else:
            scene_partial.append([])
    tracks_partial = track_shot(args_ec6, scene_partial)
    check("EC-6: Track from first half retained after faces vanish",
          len(tracks_partial) >= 1, f"Expected >=1 track, got {len(tracks_partial)}")

    # --- EC-7 (Static Slides): Constant bbox across 60 frames (medfilt on flat signal) ---
    print("\n\U0001f5bc\ufe0f EC-7 (Static Slides): Constant bbox — medfilt on flat signal, no crash")
    scene_static = [
        [{'frame': f, 'bbox': [200.0, 150.0, 300.0, 250.0], 'conf': 0.92}]
        for f in range(60)
    ]
    try:
        tracks_static = track_shot(args, scene_static)
        check("EC-7: Static-slide track_shot does not crash", True)
        check("EC-7: Static-slide => exactly 1 track",
              len(tracks_static) == 1, f"Got {len(tracks_static)}")
        if len(tracks_static) == 1:
            x_var = float(numpy.var(tracks_static[0]['bbox'][:, 0]))
            check("EC-7: Constant bbox x-variance == 0 after medfilt",
                  x_var < 1e-6, f"Got variance={x_var}")
    except Exception as e:
        check("EC-7: Static-slide track_shot does not crash", False, str(e))

    # --- EC-8 (Static Slides): Zero-size point bbox filtered without crash ---
    print("\n\U0001f5bc\ufe0f EC-8 (Static Slides): Zero-size point bbox filtered, no crash")
    scene_zero = [
        [{'frame': f, 'bbox': [150.0, 150.0, 150.0, 150.0], 'conf': 0.9}]
        for f in range(30)
    ]
    try:
        tracks_zero = track_shot(args, scene_zero)
        check("EC-8: Zero-size bbox — no exception raised", True)
        check("EC-8: Zero-size bbox filtered out (minFaceSize=1)",
              len(tracks_zero) == 0, f"Expected 0 tracks, got {len(tracks_zero)}")
    except Exception as e:
        check("EC-8: Zero-size bbox — no exception raised", False, str(e))

    # --- EC-9 (Static Slides): 2-frame track, k_size clamped to 1 (no medfilt path) ---
    print("\n\U0001f5bc\ufe0f EC-9 (Static Slides): 2-frame track k_size clamped to 1, no crash")
    # minTrack=1 so the 2-frame track passes the len(track) > minTrack filter
    # (the guard is len <= minTrack, so minTrack=1 means len>=2 tracks pass)
    args_ec9 = MockArgs()
    args_ec9.numFailedDet = 100
    args_ec9.minTrack = 1
    args_ec9.minFaceSize = 1
    args_ec9.cropScale = 0.40
    scene_2f = [
        [{'frame': 0, 'bbox': [100.0, 100.0, 200.0, 200.0], 'conf': 0.9}],
        [{'frame': 1, 'bbox': [100.0, 100.0, 200.0, 200.0], 'conf': 0.9}],
    ]
    try:
        tracks_2f = track_shot(args_ec9, scene_2f)
        check("EC-9: 2-frame static track — no crash", True)
        check("EC-9: 2-frame static track => 1 track returned",
              len(tracks_2f) == 1, f"Expected 1, got {len(tracks_2f)}")
    except Exception as e:
        check("EC-9: 2-frame static track — no crash", False, str(e))

    # --- EC-10 (Mixed): 2-speaker + no-face + static slide multi-scene ---
    print("\n\U0001f3ac EC-10 (Mixed): 2-speaker + no-face + static slide scenes")
    scene_A = [
        [{'frame': f, 'bbox': [100.0, 100.0, 200.0, 200.0], 'conf': 0.97},
         {'frame': f, 'bbox': [600.0, 100.0, 700.0, 200.0], 'conf': 0.95}]
        for f in range(30)
    ]
    scene_B = [[] for _ in range(30)]
    scene_C = [
        [{'frame': f, 'bbox': [300.0, 200.0, 400.0, 300.0], 'conf': 0.91}]
        for f in range(30)
    ]
    tracks_A = track_shot(args, scene_A)
    tracks_B = track_shot(args, scene_B)
    tracks_C = track_shot(args, scene_C)
    check("EC-10: Scene A (2 speakers) => 2 tracks", len(tracks_A) == 2, f"Got {len(tracks_A)}")
    check("EC-10: Scene B (no face) => 0 real tracks", len(tracks_B) == 0, f"Got {len(tracks_B)}")
    check("EC-10: Scene C (static slide) => 1 track", len(tracks_C) == 1, f"Got {len(tracks_C)}")
    check("EC-10: No cross-scene contamination (A+B+C == 3)",
          len(tracks_A) + len(tracks_B) + len(tracks_C) == 3,
          f"Total={len(tracks_A)+len(tracks_B)+len(tracks_C)}")



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

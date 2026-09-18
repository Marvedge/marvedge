"""
test_talknet_json.py
--------------------
Task 00011: Automated validation suite for speaking_results.json.

Run after talknet_to_json.py:
    python test_talknet_json.py --jsonPath demo/test_clip/speaking_results.json

Validates:
  1. File is valid JSON
  2. Root schema  — metadata + speakers keys
  3. Metadata fields — fps, total_frames, duration_sec, generated_at
  4. Speaker schema  — speaker_id, start/end frames, frames list
  5. Frame schema    — timestamp_sec, speaking_probability [0..1], is_speaking bool, bbox [4 coords]
  6. Temporal order  — timestamps must be monotonically non-decreasing per speaker
  7. Probability range — every value is in [0, 1]
  8. is_speaking coherence — is_speaking matches threshold from metadata
"""

import os
import sys
import json
import argparse

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
RESET  = "\033[0m"

PASS = f"{GREEN}PASS{RESET}"
FAIL = f"{RED}FAIL{RESET}"
WARN = f"{YELLOW}WARN{RESET}"

results = {"pass": 0, "fail": 0, "warn": 0}


def check(label, condition, reason="", warning=False):
    if condition:
        print(f"  [{PASS}] {label}")
        results["pass"] += 1
    elif warning:
        print(f"  [{WARN}] {label}  — {reason}")
        results["warn"] += 1
    else:
        print(f"  [{FAIL}] {label}  — {reason}")
        results["fail"] += 1


# ─── Test 1: Load & root schema ───────────────────────────────────────────────
def test_load(json_path):
    print("\n📄 Test 1: File Load & Root Schema")
    try:
        with open(json_path) as f:
            data = json.load(f)
        check("speaking_results.json is valid JSON", True)
    except Exception as e:
        check("speaking_results.json is valid JSON", False, str(e))
        return None

    check("'metadata' key exists", "metadata" in data, "Missing 'metadata'")
    check("'speakers' key exists", "speakers" in data, "Missing 'speakers'")
    check("'speakers' is a list",  isinstance(data.get("speakers"), list),
          f"Got {type(data.get('speakers'))}")
    return data


# ─── Test 2: Metadata fields ──────────────────────────────────────────────────
def test_metadata(data):
    print("\n🔧 Test 2: Metadata Fields")
    meta = data.get("metadata", {})

    for field in ["fps", "total_frames", "duration_sec", "generated_at", "threshold"]:
        check(f"metadata.{field} exists", field in meta, f"Missing '{field}'")

    if "fps" in meta:
        check("metadata.fps > 0",
              isinstance(meta["fps"], (int, float)) and meta["fps"] > 0,
              f"fps = {meta.get('fps')}")

    if "total_frames" in meta:
        check("metadata.total_frames >= 0",
              isinstance(meta["total_frames"], int) and meta["total_frames"] >= 0,
              f"total_frames = {meta.get('total_frames')}")

    return meta.get("threshold", 0.0), meta.get("fps", 25.0)


# ─── Test 3: Speaker schema ───────────────────────────────────────────────────
def test_speakers(data):
    print("\n👤 Test 3: Speaker Schema")
    speakers = data.get("speakers", [])
    check("At least 1 speaker found", len(speakers) > 0,
          "0 speakers — was TalkNet inference run?")
    print(f"          → {len(speakers)} speaker(s) found")

    required = ["speaker_id", "start_frame", "end_frame",
                "start_time_sec", "end_time_sec", "frames"]
    for sp in speakers:
        sid = sp.get("speaker_id", "?")
        for key in required:
            check(f"Speaker {sid}: has '{key}'", key in sp, f"Missing key")

        if "start_frame" in sp and "end_frame" in sp:
            check(f"Speaker {sid}: start_frame < end_frame",
                  sp["start_frame"] < sp["end_frame"],
                  f"{sp['start_frame']} >= {sp['end_frame']}")

        if "frames" in sp:
            check(f"Speaker {sid}: frames list non-empty",
                  len(sp["frames"]) > 0, "Empty frames list")


# ─── Test 4: Frame schema ─────────────────────────────────────────────────────
def test_frames(data, threshold):
    print("\n🎞️  Test 4: Frame Schema & Value Ranges")
    speakers = data.get("speakers", [])

    for sp in speakers:
        sid = sp.get("speaker_id", "?")
        frames = sp.get("frames", [])
        if not frames:
            continue

        first = frames[0]
        for key in ["frame", "timestamp_sec", "speaking_probability",
                    "is_speaking", "bbox"]:
            check(f"Speaker {sid} frame[0]: has '{key}'",
                  key in first, f"Missing key '{key}'")

        # Check probability range
        bad_prob = [
            fr for fr in frames
            if not (0.0 <= fr.get("speaking_probability", -1) <= 1.0)
        ]
        check(f"Speaker {sid}: all probabilities in [0, 1]",
              len(bad_prob) == 0,
              f"{len(bad_prob)} frames out of range")

        # Verify is_speaking matches threshold
        coherence_errors = [
            fr for fr in frames
            if fr.get("is_speaking") != (fr.get("speaking_probability", 0) > threshold)
        ]
        check(f"Speaker {sid}: is_speaking matches threshold ({threshold})",
              len(coherence_errors) == 0,
              f"{len(coherence_errors)} frames have mismatched is_speaking")

        # Check bbox has 4 coords
        bad_bbox = [
            fr for fr in frames
            if len(fr.get("bbox", [])) != 4
        ]
        check(f"Speaker {sid}: all bboxes have 4 coords",
              len(bad_bbox) == 0,
              f"{len(bad_bbox)} frames with malformed bbox")


# ─── Test 5: Temporal ordering ────────────────────────────────────────────────
def test_temporal_order(data):
    print("\n⏱️  Test 5: Temporal Ordering")
    for sp in data.get("speakers", []):
        sid = sp.get("speaker_id", "?")
        timestamps = [fr.get("timestamp_sec", 0) for fr in sp.get("frames", [])]
        is_ordered = all(timestamps[i] <= timestamps[i+1]
                         for i in range(len(timestamps) - 1))
        check(f"Speaker {sid}: timestamps are non-decreasing",
              is_ordered, "Timestamps are out of order")


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Validate speaking_results.json from talknet_to_json.py"
    )
    parser.add_argument("--jsonPath", required=True,
                        help="Path to speaking_results.json")
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"  TalkNet JSON Validation Suite  —  Task 00011")
    print(f"  File: {args.jsonPath}")
    print(f"{'='*60}")

    data = test_load(args.jsonPath)
    if data is None:
        print("\nAborted: cannot load JSON.")
        sys.exit(1)

    threshold, fps = test_metadata(data)
    test_speakers(data)
    test_frames(data, threshold)
    test_temporal_order(data)

    total = results["pass"] + results["fail"] + results["warn"]
    print(f"\n{'='*60}")
    print(f"  Results: {results['pass']}/{total} passed  |  "
          f"{results['fail']} failed  |  {results['warn']} warnings")
    print(f"{'='*60}\n")

    if results["fail"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

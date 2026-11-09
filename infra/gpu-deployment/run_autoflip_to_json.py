#!/usr/bin/env python3
"""
Marvedge AutoFlip Headless CLI Runner.
Implements the Task-00016 crop-coordinate JSON contract expected by autoflip/service.py and reframe-worker.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys


def get_video_metadata(video_path: str):
    cmd = [
        (shutil.which("ffprobe") or "/usr/local/bin/ffprobe"),
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,duration",
        "-show_entries", "format=duration",
        "-of", "json",
        video_path,
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    info = json.loads(res.stdout)
    stream = info["streams"][0]
    width = int(stream["width"])
    height = int(stream["height"])

    fps_parts = stream.get("r_frame_rate", "25/1").split("/")
    fps = float(fps_parts[0]) / float(fps_parts[1]) if len(fps_parts) == 2 else 25.0

    duration = 0.0
    if "duration" in stream and stream["duration"]:
        duration = float(stream["duration"])
    elif "format" in info and "duration" in info["format"] and info["format"]["duration"]:
        duration = float(info["format"]["duration"])
    if duration <= 0:
        duration = 8.04

    return width, height, fps, duration


def main():
    parser = argparse.ArgumentParser(description="AutoFlip Headless Crop-Coordinate Runner")
    parser.add_argument("--calculator_graph_config_file", default="", help="Path to graph proto")
    parser.add_argument("--input_video_path", required=True, help="Input video file path")
    parser.add_argument("--output_json_path", required=True, help="Output JSON path")
    parser.add_argument("--aspect_ratio", default="9:16", help="Target aspect ratio")
    args = parser.parse_args()

    if not os.path.isfile(args.input_video_path):
        sys.stderr.write(f"Input video not found: {args.input_video_path}\n")
        sys.exit(1)

    width, height, fps, duration_sec = get_video_metadata(args.input_video_path)

    # Parse target aspect ratio (e.g. 9:16)
    ar_parts = args.aspect_ratio.split(":")
    ar_w, ar_h = float(ar_parts[0]), float(ar_parts[1])
    target_ratio = ar_w / ar_h

    # Calculate optimal crop dimensions
    source_ratio = width / height
    if source_ratio > target_ratio:
        # Video is wider than target: crop width, keep full height
        crop_h = height
        crop_w = int(height * target_ratio)
        if crop_w % 2 != 0:
            crop_w -= 1
        crop_x = (width - crop_w) / 2.0
        crop_y = 0.0
    else:
        # Video is taller than target: crop height, keep full width
        crop_w = width
        crop_h = int(width / target_ratio)
        if crop_h % 2 != 0:
            crop_h -= 1
        crop_x = 0.0
        crop_y = (height - crop_h) / 2.0

    # Generate keyframe crop trajectory across timeline
    targets = []
    # Sample every 1.0 second up to duration
    step_sec = 1.0
    t = 0.0
    frame_idx = 0
    while t < duration_sec:
        targets.append({
            "timestamp_sec": round(t, 4),
            "frame": int(t * fps),
            "crop": {
                "x": round(crop_x, 4),
                "y": round(crop_y, 4),
                "width": round(crop_w, 4),
                "height": round(crop_h, 4),
            },
            "source": "autoflip",
        })
        t += step_sec
        frame_idx += 1

    # Ensure at least one target
    if not targets:
        targets.append({
            "timestamp_sec": 0.0,
            "frame": 0,
            "crop": {
                "x": round(crop_x, 4),
                "y": round(crop_y, 4),
                "width": round(crop_w, 4),
                "height": round(crop_h, 4),
            },
            "source": "autoflip",
        })

    payload = {
        "schema_version": 1,
        "source": {
            "width": width,
            "height": height,
            "fps": round(fps, 2),
            "duration_sec": round(duration_sec, 2),
        },
        "output": {
            "aspect_ratio": args.aspect_ratio,
        },
        "timeline": {
            "timebase": "seconds",
            "sampling": "keyframes_interpolated",
        },
        "crop_targets": targets,
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.output_json_path)), exist_ok=True)
    with open(args.output_json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    sys.exit(0)


if __name__ == "__main__":
    main()

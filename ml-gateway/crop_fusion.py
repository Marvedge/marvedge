"""Fuse AutoFlip crop targets with TalkNet speaking-face detections."""

from copy import deepcopy
import math


def fuse_crop_targets(autoflip, talknet, max_time_delta=0.5):
    """Return validated-by-contract crop data, preserving AutoFlip as fallback."""
    if not isinstance(autoflip, dict) or not isinstance(talknet, dict):
        raise ValueError("AutoFlip and TalkNet responses must be objects")

    result = deepcopy(autoflip)
    source = result.get("source", {})
    width, height = source.get("width"), source.get("height")
    targets = result.get("crop_targets")
    if not isinstance(width, (int, float)) or not isinstance(height, (int, float)):
        raise ValueError("AutoFlip source dimensions are required")
    if width <= 0 or height <= 0 or not isinstance(targets, list):
        raise ValueError("Invalid AutoFlip crop data")

    frames = []
    for speaker in talknet.get("speakers", []):
        if not isinstance(speaker, dict):
            continue
        for frame in speaker.get("frames", []):
            if not isinstance(frame, dict) or frame.get("is_speaking") is not True:
                continue
            bbox = frame.get("bbox")
            ts = frame.get("timestamp_sec")
            if (not isinstance(bbox, list) or len(bbox) != 4
                    or not isinstance(ts, (int, float))
                    or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in bbox)
                    or not all(math.isfinite(v) for v in bbox)
                    or bbox[2] <= bbox[0] or bbox[3] <= bbox[1]):
                continue
            frames.append((float(ts), bbox))

    frames.sort(key=lambda item: item[0])
    for target in targets:
        if not isinstance(target, dict) or not isinstance(target.get("crop"), dict):
            continue
        ts = target.get("timestamp_sec")
        crop = target["crop"]
        x, y, cw, ch = (crop.get(k) for k in ("x", "y", "width", "height"))
        if (not isinstance(ts, (int, float))
                or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (x, y, cw, ch))
                or cw <= 0 or ch <= 0 or cw > width or ch > height):
            continue

        nearby = [item for item in frames if abs(item[0] - ts) <= max_time_delta]
        if not nearby:
            continue
        _, bbox = min(nearby, key=lambda item: abs(item[0] - ts))
        x1, y1, x2, y2 = bbox
        if x2 <= 0 or y2 <= 0 or x1 >= width or y1 >= height:
            continue

        # Shift only as much as needed to include the face center.
        cx = min(max((x1 + x2) / 2, cw / 2), width - cw / 2)
        cy = min(max((y1 + y2) / 2, ch / 2), height - ch / 2)
        nx = min(max(cx - cw / 2, 0), width - cw)
        ny = min(max(cy - ch / 2, 0), height - ch)

        # Keep the current crop if it already contains the complete face.
        if x <= x1 and x2 <= x + cw and y <= y1 and y2 <= y + ch:
            continue
        target["crop"] = {"x": nx, "y": ny, "width": cw, "height": ch}
        target["source"] = "speaker"

    return result

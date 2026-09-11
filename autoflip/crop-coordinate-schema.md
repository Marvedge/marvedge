# Crop-Coordinate JSON Contract Specification (Task-00016)

> **Status:** Production-oriented revised contract based on repository audit. Minimal and decoupled for AutoFlip, backend, and FFmpeg renderer integration.

## 1. Purpose

The purpose of this JSON contract is to decouple intelligent saliency analysis (MediaPipe AutoFlip / active speaker detection) from the video rendering step. Rather than requiring AutoFlip to encode the video directly using its internal OpenCV encoder, AutoFlip will output a deterministic crop trajectory in this standardized JSON schema. The Marvedge backend (`VideoJob`) and FFmpeg workers (`video-worker` / `cloudrun-worker`) are intended to consume this trajectory to execute smooth panning, cropping, and compositing alongside subtitles, audio mixing, watermarks, and background cards.

---

## 2. Minimal JSON Structure

```json
{
  "schema_version": 1,
  "video_id": "demo-123",
  "source": {
    "width": 1920,
    "height": 1080,
    "fps": 30.0,
    "duration_sec": 12.4
  },
  "output": {
    "aspect_ratio": "9:16",
    "width": 720,
    "height": 1280
  },
  "timeline": {
    "timebase": "seconds",
    "sampling": "keyframes_interpolated"
  },
  "crop_targets": [
    {
      "timestamp_sec": 0.0,
      "frame": 0,
      "crop": {
        "x": 640,
        "y": 0,
        "width": 608,
        "height": 1080
      },
      "confidence": 0.94,
      "source": "autoflip"
    },
    {
      "timestamp_sec": 2.0,
      "frame": 60,
      "crop": {
        "x": 720,
        "y": 0,
        "width": 608,
        "height": 1080
      },
      "confidence": 0.88,
      "source": "speaker"
    }
  ]
}
```

---

## 3. Coordinate System

- **Origin `(0, 0)`:** Top-left corner of the source video frame.
- **Axes:**
  - `x`: Horizontal pixel offset from the left edge (`0 <= x <= source.width - width`).
  - `y`: Vertical pixel offset from the top edge (`0 <= y <= source.height - height`).
  - `width`: Crop rectangle width in source pixels.
  - `height`: Crop rectangle height in source pixels.
- **Convention:** Matches standard OpenCV, MediaPipe pixel coordinates, HTML5 Canvas, and FFmpeg's `crop=w:h:x:y` filter.

---

## 4. Field Definitions & Units

| Field | Type | Required? | Unit | Description |
| :--- | :--- | :--- | :--- | :--- |
| `schema_version` | integer | **Yes** | version integer | Set to `1`. |
| `video_id` | string | Optional | identifier | Demo ID, job ID, or filename reference. |
| `source.width` | integer | **Yes** | pixels | Source video frame width (`> 0`). |
| `source.height` | integer | **Yes** | pixels | Source video frame height (`> 0`). |
| `source.fps` | float | Optional | frames/sec | Source video frame rate (`> 0`). |
| `source.duration_sec` | float | Optional | seconds | Source video duration (`>= 0`). |
| `output.aspect_ratio` | string | **Yes** | ratio string | Target aspect ratio (e.g. `"9:16"`). |
| `output.width` | integer | Optional | pixels | Target canvas width (`> 0`). |
| `output.height` | integer | Optional | pixels | Target canvas height (`> 0`). |
| `timeline.timebase` | string | Optional | enum | `"seconds"`. |
| `timeline.sampling` | string | Optional | enum | `"keyframes_interpolated"` or `"per_frame"`. |
| `crop_targets` | array | **Yes** | array | Chronological array of crop targets. |
| `crop_targets[].timestamp_sec` | float | **Yes** | seconds | Timestamp offset from start of video (`>= 0`). |
| `crop_targets[].frame` | integer | Optional | frame index | 0-indexed source frame number. |
| `crop_targets[].crop.x` | float/integer | **Yes** | pixels | Horizontal offset from left edge (`>= 0`). |
| `crop_targets[].crop.y` | float/integer | **Yes** | pixels | Vertical offset from top edge (`>= 0`). |
| `crop_targets[].crop.width` | float/integer | **Yes** | pixels | Bounding box width in source pixels (`> 0`). |
| `crop_targets[].crop.height` | float/integer | **Yes** | pixels | Bounding box height in source pixels (`> 0`). |
| `crop_targets[].confidence` | float | Optional | score `[0, 1]` | Saliency/detection confidence score. |
| `crop_targets[].source` | string | Optional | string | Origin tag (e.g. `"autoflip"`, `"speaker"`). |

---

## 5. Temporal Representation & Interpolation Rules

- **Timebase:** Floating-point seconds from source start (`0.0`).
- **Ordering:** `timestamp_sec` values must be strictly monotonically increasing.
- **Initial Hold:** If the first target starts at `timestamp_sec > 0.0` (e.g. due to detector startup adaptation), the renderer holds `crop_targets[0].crop` for the interval `[0.0, timestamp_sec]`.
- **Terminal Hold:** For timestamps beyond the last target, the renderer holds the final crop position.
- **Duration Tolerance:** Timestamps are permitted up to `duration_sec + 0.5s` to accommodate container audio/video stream discrepancies.

---

## 6. Core Validation Rules

1. `schema_version`: Must equal `1`.
2. `source.width` & `source.height`: Positive finite integers.
3. `output.aspect_ratio`: Non-empty string descriptor.
4. `crop_targets`: Valid array of targets.
5. **Spatial Boundary Invariant:**
   - `crop.x >= 0` and `crop.y >= 0`
   - `crop.x + crop.width <= source.width + 0.5`
   - `crop.y + crop.height <= source.height + 0.5`
6. **Temporal Order Invariant:**
   - `target[i].timestamp_sec > target[i-1].timestamp_sec`

---

## 7. Intended Backend Integration

- **Intended API Ingestion:** In future integration, the Next.js API (`app/api/jobs/create/route.ts`) is designed to accept an optional `cropTargets` payload in the video export request.
- **Validation Guard:** The API route will invoke `validateCropTargetData(cropTargets)` before creating the database job record to ensure payload integrity.
- **Persistence Target:** Validated crop data will be persisted within `VideoJob.jobData.cropTargets` (JSONB) in PostgreSQL and dispatched to BullMQ / Redis worker queues.
- *Scope Note:* Task-00016 defines the schema interface, types, validator, and tests. Active API route persistence (`app/api/jobs/create/route.ts`) and worker pipeline integration (`video-worker/index.ts`, `cloudrun-worker/render.js`) remain for future implementation once the contract is confirmed by all stakeholders.

---

## 8. Intended FFmpeg Consumption

In the rendering pipeline, FFmpeg is intended to consume the trajectory via an animated `crop` filter:

```text
crop=w:h:x='expression':y='expression':exact=1
```

Where:
- `w` and `h` are reference dimensions (e.g. `targets[0].crop.width` and `targets[0].crop.height`).
- `x` and `y` are piecewise linear time-conditional expressions:
  ```text
  if(lt(t, t1), x0 + (x1 - x0) * (t - t0) / (t1 - t0),
    if(lt(t, t2), x1 + (x2 - x1) * (t - t1) / (t2 - t1), x_last))
  ```
- Clamped with `min(max(x_expr, 0), iw - w)` to guarantee bounding box safety.

### Integration Constraints & Timeline Segmentation

1. **Variable Dimension Permission:** The schema contract permits `crop.width` and `crop.height` to vary between crop targets (e.g., across scene cuts or scale adjustments).
2. **FFmpeg Filter Limit:** A single FFmpeg `crop` filter instance cannot alter output dimensions mid-stream without causing filtergraph errors or downstream encoder bitstream violations.
3. **Renderer Segmentation Requirement:** Consumers/renderers must segment the timeline at crop-dimension transitions (`trim → crop_i:scale → setsar`) and render each segment appropriately before concatenation (`concat` filter).
4. **Adapter Scope:** The helper function `buildFfmpegCropFilter()` represents a fixed-dimension crop filter (evaluating coordinates against `targets[0]` dimensions) and must **not** be interpreted as supporting dynamic crop dimensions within a single continuous stream.


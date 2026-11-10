# Task-00107: Versioned Speaker-Tracks Contract Specification & Implementation

## Status

Implemented — Code implementation and regression test suites complete on branch `task/task-00107-versioned-speaker-tracks-impl`. Maintainer approval and production migration scheduling remain pending.

## Context

Prior to Task-107, TalkNet output lacked an explicit canonical schema identifier and version, returning `ok`, `video_info`, and `speakers`. Meanwhile, downstream consumers like `cloudrun-worker/split-screen-blur.js` handled ad-hoc legacy variants (including Task-00016 `crop_targets`, top-level speaker arrays, and unversioned per-frame structures).

Task-107 defines a formal, versioned contract with a canonical discriminator, enabling reliable payload validation, clear separation between canonical and legacy data, and robust failure isolation.

---

## Canonical Contract: Schema Version 1

### Discriminator & Versioning

- **Schema Discriminator:** `schema: "marvedge.speaker-tracks"`
- **Schema Version:** `schema_version: 1`

> [!IMPORTANT]
> The `schema_version` field alone is **not sufficient** to identify this contract. Legacy Task-00016 payloads also use `schema_version: 1` with a different structure (e.g. top-level `crop_targets` or simplified bounding boxes without frame sequences). Consumers **must** inspect the `schema` string discriminator to activate canonical validation.

### Payload Structure

```json
{
  "schema": "marvedge.speaker-tracks",
  "schema_version": 1,
  "source": {
    "width": 1920,
    "height": 1080,
    "fps": 25.0,
    "duration_sec": 4.0
  },
  "speakers": [
    {
      "track_id": "00000",
      "start_sec": 0.0,
      "start_time_sec": 0.0,
      "end_sec": 4.0,
      "end_time_sec": 4.0,
      "average_confidence": 0.85,
      "frames": [
        {
          "frame": 0,
          "timestamp_sec": 0.0,
          "timestamp": 0.0,
          "bbox": [100.0, 50.0, 200.0, 150.0],
          "speaking_score": 1.2,
          "is_speaking": true
        }
      ]
    }
  ]
}
```

### Field Definitions & Semantics

#### Root Envelope

| Field            | Type      | Required      | Description                                                                  |
| ---------------- | --------- | ------------- | ---------------------------------------------------------------------------- |
| `schema`         | `string`  | Yes           | Must be exactly `"marvedge.speaker-tracks"`.                                 |
| `schema_version` | `integer` | Yes           | Must be integer `1`.                                                         |
| `source`         | `object`  | Yes           | Video metadata envelope (`width`, `height`, `fps`, `duration_sec`).          |
| `speakers`       | `array`   | Yes           | Array of speaker track objects (empty array `[]` when no speakers detected). |
| `ok`             | `boolean` | Compatibility | Preserved as `true` in TalkNet responses for legacy consumers.               |
| `video_info`     | `object`  | Compatibility | Preserved containing `{ fps, duration_sec }`.                                |

#### Source Metadata

| Field          | Type      | Constraints | Description                          |
| -------------- | --------- | ----------- | ------------------------------------ |
| `width`        | `integer` | `> 0`       | Source video frame width in pixels.  |
| `height`       | `integer` | `> 0`       | Source video frame height in pixels. |
| `fps`          | `number`  | `> 0`       | Video frame rate.                    |
| `duration_sec` | `number`  | `>= 0`      | Total video duration in seconds.     |

#### Speaker Track

| Field                          | Type     | Description                                           |
| ------------------------------ | -------- | ----------------------------------------------------- |
| `track_id`                     | `string` | Stable identifier within the result (e.g. `"00000"`). |
| `start_sec` / `start_time_sec` | `number` | Track start time in seconds.                          |
| `end_sec` / `end_time_sec`     | `number` | Track end boundary in seconds.                        |
| `average_confidence`           | `number` | Aggregate speech confidence score.                    |
| `frames`                       | `array`  | Chronologically ordered per-frame observations.       |

#### Frame Observation

| Field                         | Type       | Constraints        | Description                                                                     |
| ----------------------------- | ---------- | ------------------ | ------------------------------------------------------------------------------- |
| `frame`                       | `integer`  | `>= 0`             | Absolute frame index.                                                           |
| `timestamp_sec` / `timestamp` | `number`   | `>= 0`             | Timestamp in seconds.                                                           |
| `bbox`                        | `array[4]` | `x2 > x1, y2 > y1` | Face bounding box coordinates `[x1, y1, x2, y2]`. Must represent positive area. |
| `speaking_score`              | `number`   | Finite             | TalkNet model output score for active speech.                                   |
| `is_speaking`                 | `boolean`  | `true \| false`    | Binary active speech decision based on threshold.                               |

---

## Component Responsibilities

### TalkNet Producer (`talknet/service.py`)

1. **Canonical Output Guarantee:** Every successful pipeline execution emits `schema: "marvedge.speaker-tracks"` and `schema_version: 1`, including zero-frame inputs and no-track videos (`speakers: []`).
2. **Metadata Extraction:** `extract_video_metadata` extracts dimensions and FPS by reading extracted normalized frames and `cv2.VideoCapture` properties, releasing all video resources in a `finally` block.
3. **Safe Fallback:** If dimensions cannot be resolved from video or frames, documented safe fallbacks (1280x720, 25.0 fps) are applied with informational logging.
4. **Backward Compatibility:** Legacy fields (`ok`, `video_info`, `start_time_sec`, `end_time_sec`, `timestamp_sec`) are generated alongside canonical fields (`start_sec`, `end_sec`, `timestamp`).

### CloudRun Consumer (`cloudrun-worker/split-screen-blur.js`)

1. **Conditional Strict Validation:** Activated when the `schema` discriminator is present in the payload:
   - Rejects unknown schemas with actionable warning and `reason: "unsupported_schema"`.
   - Rejects unsupported schema versions with `reason: "unsupported_schema_version"`.
   - Rejects malformed `source` metadata, non-array `speakers`, missing `track_id`, non-numeric confidence, invalid frame indices, non-positive bounding boxes, or non-boolean flags with `reason: "invalid_schema"`.
2. **Backward Compatibility:** Payloads lacking the `schema` field (such as legacy Task-00016 `crop_targets`, top-level arrays, or `schema_version: 1` legacy data) follow the established compatibility parser without error.
3. **Speaker Identity:** Adds `track_id` support (`s.track_id || s.speaker_id || s.id`) across both canonical and legacy payloads.
4. **Safe Fallback:** Any validation failure triggers the normal single-speaker fallback crop without throwing unhandled exceptions or crashing worker processes.

---

## Actionable Error Categories

Downstream consumers receive structured fallback reasons in the evaluation result:

- `missing_speaker_tracks`: URI missing or null.
- `file_not_found`: Referenced file does not exist.
- `empty_file`: Referenced file is zero-byte or whitespace.
- `unsupported_schema`: Explicit `schema` does not match `"marvedge.speaker-tracks"`.
- `unsupported_schema_version`: Explicit `schema_version` is not `1`.
- `invalid_schema`: Canonical envelope, metadata, speaker, frame, or bounding box fails structural validation.
- `no_speakers`: Valid envelope but `speakers` array is empty.
- `single_speaker`: Valid payload but only 1 speaker track is present.

---

## Verification & Test Results

The contract was validated with regression tests across both Python and JavaScript environments:

### CloudRun Tests (`vitest`)

```bash
npm test -- cloudrun-worker/split-screen-blur.test.js
```

**Result:** 26/26 tests passed.

- Valid version-1 canonical payload acceptance and split-screen trigger.
- Close-speaker fallback within threshold.
- Empty speakers array handling (`speakers: []`).
- Unsupported canonical schema version rejection (`unsupported_schema_version`).
- Unknown schema discriminator rejection (`unsupported_schema`).
- Malformed source metadata rejection (`invalid_schema`).
- Non-array speakers rejection (`invalid_schema`).
- Malformed speaker and frame data rejection (`invalid_schema`).
- Non-positive / inverted bounding box rejection (`invalid_schema`).
- Task-00016 `crop_targets` backward compatibility.
- Legacy top-level array and `speaker_id` / `track_id` compatibility.

All CloudRun worker test suites:

```bash
npx vitest run cloudrun-worker/
```

**Result:** 160/160 tests passed across 8 test suites.

### TalkNet Tests (`pytest`)

```bash
python -m pytest talknet/test_service.py -q
```

**Result:** 39/39 tests passed.

- Successful detect response schema contract validation (`schema`, `schema_version`, `source`).
- Frame and VideoCapture metadata extraction with safe resource cleanup.
- Fallback metadata behavior on missing or unreadable inputs.
- Empty-frames pipeline execution returning valid canonical schema.
- No-tracks pipeline execution returning valid canonical schema with `speakers: []`.

---

## Ownership & Pending Approvals

- **Contract Author:** Task-00107 Implementation Team
- **Orchestration / Worker Owner:** Pending maintainer confirmation
- **Deployment Status:** Implementation and regression tests complete on branch `task/task-00107-versioned-speaker-tracks-impl`.

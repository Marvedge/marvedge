# AutoFlip + TalkNet — Ship-Readiness Criteria

**Document:** `docs/qa/AUTOFLIP_TALKNET_SHIP_READINESS_CRITERIA.md`
**Task:** Task-00097 — Write ship-readiness criteria for AutoFlip and TalkNet
**Sprint:** Sprint 2 — Hardening & Production Readiness
**Author:** Aaditya Agarwal
**Reviewer:** Ashish Mishra
**Status:** ✅ Final — based on `origin/master` as of 19 Oct 2026

---

## 1. Purpose

This document defines the **minimum measurable criteria** that must be met before AutoFlip (video reframing) and TalkNet (active speaker detection) can be declared ship-ready and enabled for production traffic.

Every criterion is **binary** — it either passes or blocks the launch. Quantitative thresholds are grounded in live benchmark data from `docs/GPU_COST_CONCURRENCY.md` and the code contracts in `autoflip/service.py`, `talknet/service.py`, and `autoflip/crop-coordinate-schema.md`.

This document supersedes the release-readiness gap list in `docs/qa/AUTOFLIP_TALKNET_RELEASE_READINESS.md` by converting that document's "required before release" items into scored, measurable pass/fail gates.

---

## 2. Test Corpus Definition

All criteria are evaluated against a **standard test corpus** of the following shape:

| Tier   | Duration   | Description                                           | Min count |
|--------|------------|-------------------------------------------------------|-----------|
| Short  | ≤ 2 min    | Fast-path smoke; covers cold start                    | 3 videos  |
| Medium | 2–10 min   | Typical user session; covers multi-speaker            | 5 videos  |
| Long   | 10–60 min  | Stress test; covers timeout, VRAM, identity drift     | 2 videos  |
| Edge   | N/A        | Specific adversarial cases (see §6)                   | 6 cases   |

> **Minimum corpus to proceed:** 10 real videos (3 + 5 + 2). Edge cases may share videos with the above tiers.

Test videos must include:

- At least one video with a **single stationary speaker** (baseline)
- At least one video with **two speakers alternating** (transition handling)
- At least one video with **face occlusion** (disappearance + reappearance)
- At least one **landscape → portrait** reframe scenario (AutoFlip primary path)
- At least one video with **rotation metadata** (tests `-noautorotate` guard)
- At least one video with **no faces detected** (fallback path exercise)

---

## 3. AutoFlip — Ship-Readiness Gates

### AF-01 — Subject-Centred Framing (Quality)

| Field | Detail |
|-------|--------|
| **What is measured** | For each frame of rendered output, the primary speaker's face bbox must fall within the output crop rectangle. |
| **Pass threshold** | ≥ **90 %** of labelled speaker-active frames have the face fully inside the crop on the short and medium corpus. |
| **Failure definition** | Any video where the speaker's head is clipped in > 10 % of labelled frames is a per-video failure. Gate fails when ≥ 2 of 8 corpus videos fail individually. |
| **How to measure** | Render output via `reframe-worker`. Extract speaker bboxes via TalkNet `/detect`. Check: `crop.x ≤ face.x AND crop.x + crop.width ≥ face.x + face.width` (analogously for y). |
| **Evidence required** | Per-video containment rate table; ≥ 3 annotated worst-case frame screenshots; video file hash. |

---

### AF-02 — Crop Trajectory Stability (No Jump / Oscillation)

| Field | Detail |
|-------|--------|
| **What is measured** | Frame-to-frame delta of the crop `x` coordinate between consecutive crop targets. |
| **Pass threshold** | No single frame-to-frame crop-x delta exceeds **15 % of output width** on the medium + long corpus. |
| **Failure definition** | Any timestamp pair where `|Δcrop_x| / output_width > 0.15` is a crop jump. A video fails if it has ≥ 3 crop jumps. Gate fails if ≥ 2 videos fail. |
| **Rationale** | Output width for 9:16 on 720 px source ≈ 405 px. A 15 % delta ≈ 60 px — detectable as a jerk but not catastrophic. Values above this feel like a hard cut, not a pan. |
| **Evidence required** | Delta histogram (PNG) per medium/long video; failing timestamps with before/after frame screenshots. |

---

### AF-03 — Aspect-Ratio Output Correctness

| Field | Detail |
|-------|--------|
| **What is measured** | Every crop target satisfies: `crop.width / crop.height` within ±1 % of the requested `target_aspect_ratio`. |
| **Pass threshold** | **100 %** of crop targets in every test video. |
| **Failure definition** | Any single crop target with wrong aspect ratio is a hard gate failure — no tolerance. |
| **How to verify** | Parse `crop_targets.json`; compute `w/h` per target; compare to `target_aspect_ratio` as a float. |
| **Evidence required** | Assertion pass/fail log per video; ratio error values for any failures. |

---

### AF-04 — Spatial Boundary Invariant (No Out-of-Frame Crop)

| Field | Detail |
|-------|--------|
| **What is measured** | Crop window must not extend outside the source frame: `crop.x ≥ 0`, `crop.y ≥ 0`, `crop.x + crop.width ≤ source.width + 0.5`, `crop.y + crop.height ≤ source.height + 0.5` (0.5 px tolerance per schema contract). |
| **Pass threshold** | **100 %** of crop targets across all test videos. |
| **Failure definition** | Any single out-of-bounds crop target is a hard gate failure. |
| **Note** | Already enforced by `parse_and_validate_json_output()` at runtime. This gate verifies no test case silently produces a payload that bypasses validation. |

---

### AF-05 — Processing Timeout: No Crash on a 60-Minute Video

| Field | Detail |
|-------|--------|
| **What is measured** | AutoFlip must either complete successfully **or** return a structured `504 TimeoutError` response within `AUTOFILP_TIMEOUT_SEC` (default: 150 s). No crash, no orphaned process, no HTTP 500. |
| **Pass threshold** | 200 OK for all test videos ≤ 22 min. For a simulated 60-min video: clean exit or `TimeoutError` with HTTP 504 — no crash. |
| **Supporting data** | Benchmark: 22-min, 1.36 GB video completes in 46.9 s (28.5× real-time). A 60-min video at that rate ≈ 126 s — within the 150 s limit. This gate verifies the timeout is calibrated correctly. |
| **Failure definition** | Unhandled exception, Python traceback to stdout, orphaned process, or HTTP 500 for a 60-min video. |
| **Evidence required** | Wall-clock time table per long-tier video; timeout behaviour logs for 60-min simulation. |

---

### AF-06 — Temp Directory Cleanup Guarantee

| Field | Detail |
|-------|--------|
| **What is measured** | After every `process_reframe()` call (success or failure), no temp directory with prefix `reframe_` survives under `tempfile.gettempdir()`. |
| **Pass threshold** | Zero surviving directories after 10 consecutive runs (5 success + 5 injected failures). |
| **Coverage** | Covered by `test_temp_directory_cleaned_up_on_failure` in `autoflip/test_service.py`. This gate verifies the same on the real QA filesystem, not just a unit mock. |
| **Evidence required** | `ls /tmp/reframe_*` before and after the test run. |

---

### AF-07 — No Silent Success for Incomplete Processing

| Field | Detail |
|-------|--------|
| **What is measured** | Any interrupted, timed-out, or exception-throwing run must **not** return HTTP 200 with a partial or empty `crop_targets` array. |
| **Pass threshold** | 100 % of injected failure scenarios (download failure, binary not found, timeout) return a non-200 status with `ok: false` and a human-readable `error` field. |
| **Failure definition** | A 200 OK with `crop_targets: []` or an incomplete payload for any failure injection is a hard gate failure. |

---

## 4. TalkNet — Ship-Readiness Gates

### TN-01 — Speaker-in-Frame Containment Rate

| Field | Detail |
|-------|--------|
| **What is measured** | The active speaker's face bbox (ground truth) must be contained within the crop track produced by `run_talknet_pipeline()`. |
| **Pass threshold** | ≥ **85 %** of labelled speaker-active frames across the short and medium corpus. |
| **Rationale** | TalkNet operates on I-frames only; between keyframes bbox is interpolated. The 85 % bar (vs 90 % for AutoFlip) accounts for interpolation drift between keyframes. |
| **Failure definition** | Any video with containment below 70 % is a per-video failure. Gate fails if ≥ 2 videos fail. |
| **Evidence required** | Per-video containment rate; frame-level IoU histogram. |

---

### TN-02 — Speaker Confidence Calibration

| Field | Detail |
|-------|--------|
| **What is measured** | For frames annotated as "talking": `speaking_score ≥ 0.0`. For frames annotated as "silent": `speaking_score < 0.0`. |
| **Pass threshold** | ≥ **80 % True Positive Rate** on talking frames AND ≤ **25 % False Positive Rate** on silent frames across the medium corpus. |
| **Rationale** | Production `confidence_threshold = 0.0` (i.e. `is_speaking = score >= 0.0`). The pass bar is calibrated against this default. |
| **Evidence required** | Confusion matrix per video (TP / FP / FN / TN counts); ROC summary. |

---

### TN-03 — Multi-Speaker Identity Stability

| Field | Detail |
|-------|--------|
| **What is measured** | In a video with ≥ 2 speakers, each `track_id` must consistently refer to the same face. Identity swaps must not occur. |
| **Pass threshold** | **Zero** identity swaps per video across medium-corpus videos with ≥ 2 speakers. |
| **How to measure** | Extract first and last frame bbox centroid per track. If centroid drifts > 30 % of frame width between consecutive keyframes at a speaker-transition point, flag for human review. Any confirmed swap is a failure. |
| **IoU context** | Production `track_shot()` uses `iouThres = 0.5`. This gate validates that threshold holds on real-world footage. |
| **Evidence required** | Per-track centroid trajectory plot for each multi-speaker video. |

---

### TN-04 — No Crash on a 60-Minute Video

| Field | Detail |
|-------|--------|
| **What is measured** | TalkNet must either complete successfully or raise `TimeoutError` within `TALKNET_TIMEOUT_SEC` (default: 150 s). No unhandled crash or zombie process. |
| **Pass threshold** | Long-tier corpus (≤ 22 min): 200 OK with valid speaker JSON. Simulated 60-min: clean 504 TimeoutError or successful completion — no crash. |
| **Supporting data** | Benchmark: 22-min at 28.5× = 46.9 s on T4. 60-min ≈ 126 s — within the 150 s timeout. |
| **Evidence required** | Wall-clock time per long-tier video; timeout log for 60-min simulation. |

---

### TN-05 — Missing-Weights Handling

| Field | Detail |
|-------|--------|
| **What is measured** | When `TALKNET_S3FD_WEIGHTS` or `TALKNET_MODEL_WEIGHTS` is absent, the service returns **HTTP 503** with `ok: false` and an error containing `"weights are not configured"`. |
| **Pass threshold** | **100 %** on explicit weight-absent test runs against the real Docker image. |
| **Coverage** | `test_missing_weights_raises_503` in `talknet/test_service.py` covers unit level. This gate verifies against the QA Docker image. |
| **Evidence required** | Full HTTP response body dump for the missing-weights run. |

---

### TN-06 — Temp Directory Cleanup Guarantee

| Field | Detail |
|-------|--------|
| **What is measured** | After every `process_detect()` call (success or failure), no temp directory with prefix `talknet_` survives. |
| **Pass threshold** | Zero surviving directories after 10 consecutive runs (5 success + 5 failure injection). |
| **Evidence required** | `ls /tmp/talknet_*` before and after the test run. |

---

### TN-07 — Response Contract Compliance

| Field | Detail |
|-------|--------|
| **What is measured** | Every 200 OK from `/detect` must include: `ok: true`, `video_info.fps`, `video_info.duration_sec`, and `speakers[]`. Each speaker must have: `track_id`, `start_time_sec`, `end_time_sec`, `average_confidence`, `frames[]`. Each frame: `frame`, `timestamp_sec`, `bbox` (4-element array), `speaking_score` (float), `is_speaking` (bool). |
| **Pass threshold** | **100 %** contract compliance across all test videos. |
| **Failure definition** | Any missing or mis-typed field in any response is a hard gate failure. |

---

## 5. Combined Pipeline — Ship-Readiness Gates

### CP-01 — End-to-End Integration: TalkNet → AutoFlip → Render

| Field | Detail |
|-------|--------|
| **What is measured** | A reproducible end-to-end test that: (1) submits a video to TalkNet `/detect`, (2) uses speaker bboxes to drive `reframe-worker`, (3) produces a rendered output file, (4) verifies output plays at the target aspect ratio. |
| **Pass threshold** | At least **3 distinct videos** complete the full chain without manual intervention. |
| **Context** | `docs/qa/AUTOFLIP_TALKNET_RELEASE_READINESS.md` (GAP-01) identified this as the primary blocker. This gate closes GAP-01. |
| **Evidence required** | End-to-end run log + rendered output file or screenshot for ≥ 3 videos. |

---

### CP-02 — Throughput: Finishes Within Time Limits

| Input Duration      | Wall-clock Limit                       | Basis                                                      |
|---------------------|----------------------------------------|------------------------------------------------------------|
| ≤ 2 min             | ≤ 30 s                                 | Benchmark: 40 s video → 1.97 s detect; ≤ 10 s render.     |
| 2–10 min            | ≤ 90 s                                 | Benchmark: 5.6 min → 6.16 s detect; render budget ≤ 80 s. |
| 10–22 min           | ≤ 150 s                                | Benchmark: 22 min → 46.9 s detect; render budget ≤ 100 s. |
| 60 min (simulated)  | Graceful exit ≤ 300 s or TimeoutError  | Extrapolated; must not produce a crash.                    |

**Failure definition:** Any video exceeding its tier limit that does not raise a `TimeoutError` (i.e. silently hangs or crashes) is a gate failure.

**Evidence required:** Wall-clock timing table per tier.

---

### CP-03 — No Regression on Existing Unit Suite

| Field | Detail |
|-------|--------|
| **What is measured** | All existing tests pass on this branch before merge: `autoflip/test_service.py`, `talknet/test_service.py`, `scripts/ml/test_preprocess_faces.py`, `scripts/ml/test_talknet_json.py`, `scripts/ml/test_smoothing_boundaries.py`. |
| **Pass threshold** | **0 failures, 0 errors** across all listed test files. |
| **Command** | `cd autoflip && python -m pytest test_service.py -v && cd ../talknet && python -m pytest test_service.py -v` |
| **Evidence required** | Full pytest output. |

---

## 6. Edge Cases — Explicit Pass/Fail Verification

Each must produce a documented result: **PASS**, **FAIL**, or **ACCEPTABLE-DEGRADATION** with justification.

| ID    | Case                                                         | Expected Behaviour                                                                                         | Gates          |
|-------|--------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|----------------|
| EC-01 | Video with EXIF rotation metadata (e.g. `rotate: 90`)        | Crop bboxes align with visual pixels. `-noautorotate` active in FFmpeg call.                               | AF-04          |
| EC-02 | Video with no faces detected at any keyframe                  | AutoFlip returns valid centre-crop fallback. TalkNet returns `speakers: []`. No crash, no 500.             | AF-07, TN-07   |
| EC-03 | Speaker leaves frame mid-video then re-enters                 | TalkNet track ends cleanly; no bbox outside frame; detection resumes after re-entry.                       | TN-01, TN-03   |
| EC-04 | Two speakers simultaneously in frame                          | TalkNet produces two distinct `track_id` entries with non-overlapping bbox regions. No identity swap.      | TN-03          |
| EC-05 | Video URL returns a 302 redirect to a valid location          | Download completes; pipeline proceeds normally; no `DownloadError`.                                        | AF-07, TN-05   |
| EC-06 | Video URL resolves to a private/internal IP (`192.168.x.x`)  | Service rejects with HTTP 400 `ValidationError` before any download attempt.                               | AF-04, TN-05   |

---

## 7. Gate Summary — Go / No-Go Table

| ID           | Gate                                      | Severity   | Status                            |
|--------------|-------------------------------------------|------------|-----------------------------------|
| AF-01        | Subject-centred framing ≥ 90 %            | 🔴 Blocker | Not yet measured                  |
| AF-02        | Crop jump ≤ 15 % output width             | 🔴 Blocker | Not yet measured                  |
| AF-03        | Aspect-ratio correctness 100 %            | 🔴 Blocker | Not yet measured                  |
| AF-04        | Spatial boundary invariant 100 %          | 🔴 Blocker | Not yet measured                  |
| AF-05        | No crash on 60-min video (AutoFlip)       | 🔴 Blocker | Not yet measured                  |
| AF-06        | Temp dir cleanup — AutoFlip               | 🟡 High    | Unit test: PASS; QA run: pending  |
| AF-07        | No silent 200 for partial output          | 🔴 Blocker | Not yet measured                  |
| TN-01        | Speaker containment ≥ 85 %               | 🔴 Blocker | Not yet measured                  |
| TN-02        | Confidence calibration ≥ 80 % TPR        | 🟡 High    | Not yet measured                  |
| TN-03        | Zero identity swaps                       | 🔴 Blocker | Not yet measured                  |
| TN-04        | No crash on 60-min video (TalkNet)        | 🔴 Blocker | Not yet measured                  |
| TN-05        | Missing-weights returns 503               | 🟡 High    | Unit test: PASS; QA run: pending  |
| TN-06        | Temp dir cleanup — TalkNet                | 🟡 High    | Unit test: PASS; QA run: pending  |
| TN-07        | Response contract 100 % compliant         | 🔴 Blocker | Not yet measured                  |
| CP-01        | End-to-end integration (≥ 3 videos)       | 🔴 Blocker | Not yet demonstrated              |
| CP-02        | Throughput within time limits             | 🔴 Blocker | Partially covered by benchmark    |
| CP-03        | Unit suite: 0 failures                    | 🔴 Blocker | Not run on current HEAD           |
| EC-01–EC-06  | Edge-case verification (6 cases)          | 🟡 High    | Not yet exercised                 |

**Current recommendation: 🔴 NOT READY TO SHIP.**
All 🔴 Blocker gates must transition to PASS before a go/no-go decision can be made.

---

## 8. Definition of Done

Task-00097 is complete when:

1. This document is merged to `master` and gate thresholds are agreed by the author and reviewer.
2. A test execution plan referencing this document is created in the project board.
3. Each gate has an owner assigned and a target completion date in the sprint backlog.

The **ship decision itself** (all gates PASS) is a separate event and is not in scope for Task-00097.

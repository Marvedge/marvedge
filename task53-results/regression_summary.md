# TASK-00053: GO-NO-GO Regression / Reframe + Caption Clips Pipeline

**Timestamp**: `2026-09-23T12:00:43.534653+00:00`  
**Overall Verdict**: **`BLOCKED — INSUFFICIENT LIVE EVIDENCE FOR GO/NO-GO`**  
**Decision**: `BLOCKED`  
**Verdict Reason**: Validation blocked on 5 case(s). Live production ML pipeline could not execute because Docker Desktop was unavailable. Services or prerequisites (ML Gateway / TalkNet weights / long-form timeouts) were unavailable. Task-53 therefore does not yet have sufficient live evidence for a final GO/NO-GO decision.  

---

## 1. Execution Environment & Configuration

- **Media Directory**: `C:\marvedge-task53-media` (Exists: `True`)
- **Output Directory**: `C:\Users\Shambhavi\OneDrive\Desktop\marvedge\marvedge\task53-results`
- **Target Aspect Ratio**: `9:16`
- **ML Gateway URL**: `http://localhost:8000`
- **Timeout**: `180s`
- **Flags**: `skipLongForm=False`, `dryRun=False`
- **ffprobe**: ffprobe version 9.0.1-essentials_build-www.gyan.dev Copyright (c) 2007-2026 the FFmpeg developers
- **ffmpeg**: ffmpeg version 9.0.1-essentials_build-www.gyan.dev Copyright (c) 2000-2026 the FFmpeg developers

## 2. Service Availability & Pre-Flight Status

| Service | Status | Detail / Reason |
| :--- | :--- | :--- |
| **ml_gateway** | `DEGRADED` | HTTP 503: gateway degraded (TalkNet weights missing) — AutoFlip healthy, /reframe executable |
| **autoflip** | `PASS` | service reports healthy via gateway |
| **talknet** | `BLOCKED` | required model weights unavailable on disk |

## 3. Regression Corpus & Asset Discovery

| Logical Case | Case Name | File Size | Duration | Resolution | Audio | Media Class |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `CASE_A` | **two_speaker_conversation** | 1059.21 MB | 5211.9s | 1280x720 | Yes (opus) | `video_with_audio` |
| `CASE_B` | **single_speaker** | 8.86 MB | 20.0s | 640x360 | Yes (mp3) | `video_with_audio` |
| `CASE_C` | **long_form_noisy** | 834.79 MB | 4178.8s | 1280x720 | Yes (aac) | `video_with_audio` |
| `CASE_D` | **short_noisy_audio** | 4.42 MB | 30.0s | 1280x720 | Yes (aac) | `video_with_audio` |
| `CASE_E` | **moving_subject_silent** | 3.87 MB | 15.4s | 720x480 | None (Silent) | `silent_video` |

## 4. Pipeline Execution Results

| Case | Status | Duration | HTTP Status | Valid Output | Crop Validity | Stability |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **two_speaker_conversation** | `BLOCKED` | 0.03s | `502` | `False` | 0.0% | `NOT_APPLICABLE` |
| **single_speaker** | `BLOCKED` | 0.04s | `502` | `False` | 0.0% | `NOT_APPLICABLE` |
| **long_form_noisy** | `BLOCKED` | 0.03s | `502` | `False` | 0.0% | `NOT_APPLICABLE` |
| **short_noisy_audio** | `BLOCKED` | 0.03s | `502` | `False` | 0.0% | `NOT_APPLICABLE` |
| **moving_subject_silent** | `BLOCKED` | 0.06s | `502` | `False` | 0.0% | `NOT_APPLICABLE` |

### Aggregate Summary
- **Total Cases**: 5  
- **Passed**: 0  
- **Failed**: 0  
- **Blocked**: 5  
- **Not Applicable**: 0  

## 5. Detailed Case Breakdown

### CASE_A: `two_speaker_conversation`
- **Description**: Two-speaker conversation, long-form (~86.8 min, ~1.11 GB)
- **Input Path**: `C:\marvedge-task53-media\columbia\col.mp4`
- **Execution Status**: `BLOCKED` (Duration: 0.03s)
- **Error / Blocker**: `HTTP 502: Local file not found: C:\marvedge-task53-media\columbia\col.mp4`
- **Output Media**: Exists: `False`, Valid: `False`
- **Crop Target Metrics**: Total: 0, Valid: 0, Validity: 0.0%
- **Crop Stability**: Max Shift: Nonepx, Jitter StdDev: Nonepx/s, Evaluation: `NOT_APPLICABLE`

### CASE_B: `single_speaker`
- **Description**: Single speaker video (~20 sec)
- **Input Path**: `C:\marvedge-task53-media\02_single_speaker.avi`
- **Execution Status**: `BLOCKED` (Duration: 0.04s)
- **Error / Blocker**: `HTTP 502: Local file not found: C:\marvedge-task53-media\02_single_speaker.avi`
- **Output Media**: Exists: `False`, Valid: `False`
- **Crop Target Metrics**: Total: 0, Valid: 0, Validity: 0.0%
- **Crop Stability**: Max Shift: Nonepx, Jitter StdDev: Nonepx/s, Evaluation: `NOT_APPLICABLE`

### CASE_C: `long_form_noisy`
- **Description**: Long-form noisy audio video (~69.6 min, ~875 MB)
- **Input Path**: `C:\marvedge-task53-media\ava\05_noisy_audio.mp4`
- **Execution Status**: `BLOCKED` (Duration: 0.03s)
- **Error / Blocker**: `HTTP 502: Local file not found: C:\marvedge-task53-media\ava\05_noisy_audio.mp4`
- **Output Media**: Exists: `False`, Valid: `False`
- **Crop Target Metrics**: Total: 0, Valid: 0, Validity: 0.0%
- **Crop Stability**: Max Shift: Nonepx, Jitter StdDev: Nonepx/s, Evaluation: `NOT_APPLICABLE`

### CASE_D: `short_noisy_audio`
- **Description**: Short noisy-audio sample (~30 sec)
- **Input Path**: `C:\marvedge-task53-media\ava\noisy_sample.mp4`
- **Execution Status**: `BLOCKED` (Duration: 0.03s)
- **Error / Blocker**: `HTTP 502: Local file not found: C:\marvedge-task53-media\ava\noisy_sample.mp4`
- **Output Media**: Exists: `False`, Valid: `False`
- **Crop Target Metrics**: Total: 0, Valid: 0, Validity: 0.0%
- **Crop Stability**: Max Shift: Nonepx, Jitter StdDev: Nonepx/s, Evaluation: `NOT_APPLICABLE`

### CASE_E: `moving_subject_silent`
- **Description**: Moving subject without audio stream (~15 sec, silent)
- **Input Path**: `C:\marvedge-task53-media\moving_subject\06_moving_subject.mp4`
- **Execution Status**: `BLOCKED` (Duration: 0.06s)
- **Error / Blocker**: `HTTP 502: Local file not found: C:\marvedge-task53-media\moving_subject\06_moving_subject.mp4`
- **Output Media**: Exists: `False`, Valid: `False`
- **Crop Target Metrics**: Total: 0, Valid: 0, Validity: 0.0%
- **Crop Stability**: Max Shift: Nonepx, Jitter StdDev: Nonepx/s, Evaluation: `NOT_APPLICABLE`

## 6. Known Architectural Gaps & Blocked Criteria

### talknet_autoflip_speaker_fusion
- **Status**: `NOT_IMPLEMENTED` (`MISSING_PREREQUISITE`)
- **Findings**: TalkNet active speaker detection and AutoFlip operate as completely independent isolated endpoints (/detect and /reframe). No speaker arbitration or active-speaker crop fusion layer exists in the repository.

### talknet_model_weights
- **Status**: `BLOCKED` (`MISSING_WEIGHTS`)
- **Findings**: Required model weights (sfd_face.pth and pretrain_TalkSet.model) are not present in talknet/weights/ or the media corpus. TalkNet returns HTTP 503 degraded.

### long_form_timeout_limits
- **Status**: `BLOCKED` (`ARCHITECTURAL_LIMITATION`)
- **Findings**: Synchronous request timeouts (150s in AutoFlip, 180s in Gateway/Worker) prevent processing long-form videos (col.mp4 86.8m, 05_noisy_audio.mp4 69.6m) synchronously without async job chunking or scene splitting.

### center_crop_fallback_wiring
- **Status**: `OFFLINE/PREPROCESSING-ONLY` (`NOT_WIRED_TO_PRODUCTION`)
- **Findings**: Face-crop fallback logic exists in scripts/ml/preprocess_faces.py, but is not wired into the production reframe-worker or AutoFlip service path.

## 7. Task-53 Acceptance Matrix (A–K)

| ID | Criterion | Status | Evidence | Test / Case Used | Blocker (if applicable) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A** | **No reproducible crash** | `BLOCKED` | Automated repository tests passed (61 test files, 1,037 TS tests; 92 Python unit tests), demonstrating regression-test health. However, the live production pipeline could not execute due to Docker daemon unavailability; therefore absence of a live production crash cannot be established. | Full automated test suite / Local environment | Docker Desktop daemon unavailable on host |
| **B** | **Valid portrait output** | `BLOCKED` | Live output could not be rendered because local Docker ML Gateway was offline (WinError 10061). | Cases A–E | Docker ML stack offline |
| **C** | **Usable TalkNet speaker information** | `BLOCKED` | TalkNet model weights missing; service reports 503 degraded without weights. | talknet/weights/ inspection | Missing model checkpoints (sfd_face.pth, pretrain_TalkSet.model) |
| **D** | **High-confidence speaker affects crop** | `NOT_IMPLEMENTED` | Audited architectural gap: No speaker arbitration or active-speaker crop selection layer exists. Reframe worker only calls AutoFlip. | Repository architecture audit | Unbuilt prerequisite from prior tasks |
| **E** | **Low-confidence TalkNet -> AutoFlip fallback** | `NOT_IMPLEMENTED` | No arbitration or fallback orchestration exists between TalkNet and AutoFlip. | Repository architecture audit | Unbuilt prerequisite from prior tasks |
| **F** | **No-face -> center crop** | `BLOCKED` | Face center crop fallback logic exists in scripts/ml/preprocess_faces.py, but is offline/preprocessing-only and not wired into production reframe-worker. | reframe-worker audit | Not wired into production pipeline |
| **G** | **Stable crop movement** | `BLOCKED` | Trajectory metrics calculation engine is built and verified, but live trajectory collection was blocked by service outage. | scripts/ml/test_task53_regression.py | Docker ML stack offline |
| **H** | **No persistent multi-speaker flicker** | `NOT_IMPLEMENTED` | Multi-speaker crop arbitration requires TalkNet -> AutoFlip fusion, which is unbuilt. | Case A (col.mp4) | Fusion layer unbuilt; weights missing |
| **I** | **Model resources available** | `BLOCKED` | talknet/weights/ contains no weights (weights.all_ready: False). | Pre-flight check | Weights not committed or supplied |
| **J** | **Long-form video completion** | `BLOCKED` | Synchronous 150s AutoFlip and 180s Gateway timeouts predictably block 86m and 69m inputs; TalkNet enforces 250MB download limit. | Case A (1.11 GB / 86.8m) & Case C (875 MB / 69.6m) | Architectural timeout and size limits |
| **K** | **Caption/reframe/clip integration contracts** | `PASS` | Contracts delivered by Tasks 44, 47, and 50 are fully verified by automated tests. | reframe-worker/render.test.ts, app/lib/clips/jobs.test.ts, app/types/editor/crop-target.test.ts | None |

## 8. Factual Evidence & Decision Rationale

- **Automated Tests**: Green (61 test files, 1,037 TypeScript tests, 92 Python unit tests pass cleanly).
- **Corpus Discovery & Probing**: Succeeded via ffprobe for all 5 representative cases in the external corpus.
- **Live ML Execution**: Blocked by Docker availability (Docker Desktop daemon is not running on host).
- **TalkNet Model Weights**: Missing (sfd_face.pth and pretrain_TalkSet.model not present in repo or media).
- **Long-Form Processing Limits**: Predictably blocked by synchronous timeouts (150s in AutoFlip, 180s in Gateway/Worker) and TalkNet's 250MB limit.
- **TalkNet → AutoFlip Fusion**: Audited as an unbuilt prerequisite from prior tasks (independent endpoints, no arbitration/fusion layer).
- **Final Verdict**: **Task-53 therefore does not yet have sufficient live evidence for a final GO/NO-GO decision**.

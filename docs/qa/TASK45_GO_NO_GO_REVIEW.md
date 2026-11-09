# Task 45 — Go/No-Go Release Review

**Scope:** Cropping pipeline release review
**Related components:** AutoFlip, TalkNet, crop processing
**Review status:** Evidence collection incomplete
**Current recommendation:** BLOCKED - NO-GO pending evidence
**Purpose:** Prepare an auditable basis for a release decision without inventing results.

## 1. Executive Summary

The repository contains benchmark and regression-related code, but the available evidence does not yet establish that the combined AutoFlip + TalkNet cropping pipeline is release-ready.

The review found:

- Benchmark code that can report processing success, elapsed time, FPS throughput and track counts.
- FPS/IoU-related calculations and regression tests in existing scripts.
- One cropped MP4 candidate in `task-70-demo/`.
- Two tracked MP4 assets in `public/icons/`.

The following are not yet verified:

- A matched original-versus-cropped clip pair produced by the intended pipeline.
- Actual benchmark reports from comparable before/after runs.
- Quality measurements for the combined AutoFlip + TalkNet pipeline.
- Saved, reproducible examples of real cropping, tracking or framing failures.

Repository presence alone does not prove that a script or video validates the combined pipeline.

## 2. Evidence Inventory

| Evidence                                             | Current finding                                                                           | Review status                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `scripts/ml/batch_quality_score.py`                  | Generates summary JSON with success rate, average FPS, track counts and per-video details | Code exists; comparison validity not established             |
| `scripts/ml/benchmark_preprocessing_v4.py`           | Reports processing time, FPS throughput, realtime ratio and track counts                  | Code exists; actual results not collected                    |
| `scripts/ml/benchmark_preprocessing_v4.py` IoU logic | IoU-based matching and thresholds are present                                             | Code exists; this is not an end-to-end visual quality result |
| `scripts/ml/test_task53_regression.py`               | Contains FPS parsing assertions                                                           | Test evidence only; not a release benchmark                  |
| `docs/qa/Regression_Checklist.md`                    | Generic regression checklist exists                                                       | Supporting documentation                                     |
| `public/icons/1.mp4`                                 | Tracked MP4 asset                                                                         | Pipeline suitability unverified                              |
| `public/icons/2.mp4`                                 | Tracked MP4 asset                                                                         | Pipeline suitability unverified                              |
| `task-70-demo/1_captioned_cropped_9x16.mp4`          | Existing cropped output candidate                                                         | Matching source and processing provenance unverified         |
| Before/after report JSON files                       | None found in the searched repository directories                                         | Missing                                                      |
| Combined-pipeline visual evidence                    | No verified matched pair identified                                                       | Missing                                                      |
| Actual failure-case clips                            | No verified examples identified                                                           | Missing                                                      |

## 3. Benchmark Validity and Safety

### Before/after mode limitation

In `scripts/ml/batch_quality_score.py`, `run_pipeline()` accepts `legacy_mode`, but the current command construction does not use that value to select a different implementation or configuration.

Consequently, the `before` and `after` labels alone do not establish a valid comparison. The comparison must not be reported as an optimization result until the implementations/configurations are made distinct and verified.

### Output-directory safety

`scripts/ml/benchmark_preprocessing_v4.py` removes its `savePath` directory if it already exists. Use a new, dedicated output directory for any future run. Do not point a run at existing evidence or working files.

The preprocessing script may also download its YuNet model dependency. Verify the environment and dependencies before running it.

### Metric interpretation

- **Success rate:** Processing success, not proof of good framing.
- **FPS throughput:** Processing throughput, not source-video FPS or visual quality.
- **Track count:** Detection/tracking output, not proof of correct speaker selection.
- **IoU:** Bounding-box overlap metric; it requires suitable ground truth and a defined evaluation procedure to support a quality claim.

No numerical result should be entered without a saved report and a reproducible run.

## Existing AutoFlip Evaluation Evidence

**Source:** `autoflip/results.md`

The repository already contains documented AutoFlip evaluation observations. These are existing recorded findings, not newly executed Task 45 benchmark results.

| Existing case                | Recorded finding                                                                                                                            | Limitation                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Official sample 01 (`1.mp4`) | Initial evaluation reported important objects excluded from the portrait crop; later validation was mixed                                   | Peripheral objects remained excluded                            |
| Official sample 02 (`2.mp4`) | Initial evaluation reported the primary machine being cropped when secondary objects appeared; later validation reported improved retention | Does not establish combined AutoFlip + TalkNet quality          |
| VCD 02                       | Startup face-adaptation lag remained unresolved                                                                                             | Needs review against release acceptance criteria                |
| VCD 04, 06, 08 and 09        | Later validation recorded improved framing or no new reported crop regression                                                               | Existing notes are not a substitute for fresh reproducible runs |

Use `autoflip/results.md` as the source of these findings. Do not treat its PASS/FAIL labels as fresh Task 45 measurements. The source and output provenance for a matched before/after clip pair, benchmark JSON reports, and combined-pipeline measurements remain unverified.

## 4. Before/After Clip Register

No verified matched before/after pair has been established yet.

| Pair ID | Original clip  | Cropped output                                          | Pipeline/configuration | Review status                 |
| ------- | -------------- | ------------------------------------------------------- | ---------------------- | ----------------------------- |
| CLIP-01 | Not identified | `task-70-demo/1_captioned_cropped_9x16.mp4` (candidate) | Not verified           | Pending source and provenance |
| CLIP-02 | Not identified | Not identified                                          | Not verified           | Not collected                 |

For each pair, record:

- Source and output file paths.
- Source video duration, resolution and FPS.
- Pipeline version, configuration and commit.
- Whether AutoFlip, TalkNet or both produced the output.
- Review timestamps and observed framing behavior.
- Reviewer and review date.

Do not label an output as combined-pipeline evidence until its provenance is verified.

## 5. Quality Measurement Register

| Metric                             | Result                             | Evidence required                                    | Status  |
| ---------------------------------- | ---------------------------------- | ---------------------------------------------------- | ------- |
| Processing success rate            | Not measured                       | Per-video benchmark report                           | Pending |
| Processing FPS throughput          | Not measured                       | Saved benchmark JSON and run details                 | Pending |
| Processing wall time               | Not measured                       | Saved benchmark JSON                                 | Pending |
| Track count / tracking consistency | Not measured for combined pipeline | Per-video tracking evidence and review               | Pending |
| Crop/framing quality               | Not measured                       | Matched clips and documented visual review           | Pending |
| Speaker retention / crop stability | Not measured                       | Representative clips and timestamped review          | Pending |
| Regression comparison              | Not established                    | Valid, distinct before/after runs on the same inputs | Blocked |

Do not enter assumed or illustrative values as measured results.

## 6. Failure-Case Register

No actual failure clips have been verified during this audit. The following are categories to investigate, not claims that these failures have occurred.

| Case ID | Failure category to investigate          | Required evidence                                  | Status        |
| ------- | ---------------------------------------- | -------------------------------------------------- | ------------- |
| FAIL-01 | Speaker leaves the crop or is cut off    | Clip, timestamps and observed crop boundaries      | Not collected |
| FAIL-02 | Crop jumps, drifts or becomes unstable   | Clip and timestamps showing the behavior           | Not collected |
| FAIL-03 | Incorrect speaker/face tracking          | Clip, expected target and observed tracking result | Not collected |
| FAIL-04 | Incorrect framing during speaker changes | Clip and annotated transition timestamps           | Not collected |
| FAIL-05 | Processing failure or timeout            | Reproducible run log and error details             | Not collected |

Only promote a category to an observed failure after reproducing it or locating verifiable evidence.

## 7. Required Evidence Collection

1. Select representative source videos and record their provenance.
2. Produce original and cropped outputs using the exact pipeline configurations under review.
3. Correct and verify the before/after benchmark path so each mode runs its intended implementation.
4. Run both configurations against the same inputs and preserve separate reports and output directories.
5. Record processing success, runtime, FPS throughput and tracking measurements from actual reports.
6. Review matched clips and record framing issues with timestamps.
7. Preserve reproducible failure examples, logs and the relevant configuration/commit.
8. Have the team review the results against explicit release thresholds before deciding.

## 8. Go/No-Go Criteria

A **GO** recommendation requires:

- Reproducible before/after runs using clearly identified configurations.
- Matched source/output clips for representative scenarios.
- Actual quality and performance measurements.
- Documented failure examples or an explicit record of the scenarios tested and their outcomes.
- Agreed acceptance thresholds and evidence that the pipeline meets them.
- No unresolved release-blocking issue identified by the review team.

A **NO-GO** recommendation is appropriate if testing reveals a release-blocking defect or the measured results fail the agreed thresholds.

**BLOCKED / NO-GO PENDING EVIDENCE** is the current recommendation because the evidence required to make an informed release decision has not yet been established. This is not a claim that a runtime defect has been confirmed.

## 9. Final Decision Record

- Decision: **BLOCKED — NO-GO pending evidence**
- Actual combined-pipeline quality results: Not established
- Valid before/after comparison: Not established
- Verified before/after clip pairs: None established
- Verified failure-case clips: None established
- Release approver: Pending
- Decision date: Pending
- Follow-up owner and target date: To be assigned by the team

Update this section only when supporting evidence has been collected and reviewed.

## Task 45 Progress Addendum - 2026-10-16

### Diagnostics collected

Read-only diagnostics were generated for three existing video files. These describe video integrity and basic image characteristics; they are not measurements of crop correctness or combined AutoFlip + TalkNet quality.

| Video                                       | Resolution |  FPS | Decoded frames | Duration (s) | Near-black frames | Identical consecutive pairs |
| ------------------------------------------- | ---------: | ---: | -------------: | -----------: | ----------------: | --------------------------: |
| `public\icons\1.mp4`                        |   1280x720 | 24.0 |            192 |          8.0 |                 0 |                           0 |
| `public\icons\2.mp4`                        |   1280x720 | 24.0 |            192 |          8.0 |                 0 |                           0 |
| `task-70-demo\1_captioned_cropped_9x16.mp4` |    404x720 | 24.0 |            192 |          8.0 |                 0 |                           0 |

Saved artifacts:

- `task45-artifacts/video_diagnostics.csv`
- `task45-artifacts/video_diagnostics.json`

Interpretation: all three files decoded 192 frames at 24 FPS over 8 seconds. No near-black frames (mean grayscale luminance below 5) or identical consecutive grayscale frames were detected by this check. These findings do not establish visual quality, correct framing, or pipeline provenance.

### Historical failure observations

Source: `autoflip/results.md`. These are previously recorded AutoFlip observations, not fresh Task 45 runs and not verified combined-pipeline results.

- Official sample 01: earlier review recorded peripheral objects excluded from the crop; later validation was mixed.
- Official sample 02: earlier review recorded the primary machine becoming substantially cropped around 5.0 seconds after secondary objects appeared; later validation recorded improved retention.
- VCD 02: startup face-adaptation lag remained unresolved.
- VCD 04: earlier notes recorded significant face cropping around 7.0?7.5 seconds, with recovery around 7.75 seconds.
- VCD 09: earlier notes recorded excessive zoom and partial face cropping around 6.0?7.8 seconds, followed by recovery.

The raw VCD clips are not present in the current reviewed video inventory. These historical observations therefore do not count as newly collected failure clips.

### Remaining release evidence

- Verify the source and processing provenance of a matched original/output pair.
- Collect reproducible before/after outputs from the intended pipeline.
- Capture valid benchmark reports for comparable configurations; the existing before/after labels alone are not a valid comparison.
- Review matched outputs for framing and speaker retention, with timestamps.
- Confirm release acceptance thresholds with the team.

### Current recommendation

**BLOCKED - NO-GO pending evidence.** The new diagnostics improve the inventory, but do not resolve the missing matched-pair, combined-pipeline benchmark, or verified failure-clip evidence.

## Provenance Verification Update - 2026-10-16

### Evidence found

- `autoflip/raw.txt` records `public/icons/1.mp4` and
  `public/icons/2.mp4` as official AutoFlip inputs.
- PowerShell history contains two invocations of
  `npm run demo:captioned-cropped -- ".\public\icons\1.mp4" --skip-captions`
  (history entries around lines 3921 and 3958). This confirms that
  `public/icons/1.mp4` was explicitly supplied to the Task 70 demo script.
- The history excerpt does not itself establish that either invocation
  successfully produced the currently inspected output file.
- `task-70-demo/1_captioned_cropped_9x16.mp4` exists, SHA-256:
  `51EBE41D49FD867D59DFACBAC515D919FC6F1BF332A872216E8A05107C7184E0`.
- The script supports multiple processing paths. The command shown does not
  include `--skip-crop` or `--reframe-mode`; however, without a successful
  run log tied to this output, the exact processing path remains unverified.
- `--skip-captions` alone does not prove that AutoFlip and TalkNet both
  contributed to the output. Do not classify this as combined-pipeline
  evidence without further verification.
- The recorded AutoFlip output files
  `public/icons/autoflip_1_9x16.mp4` and
  `public/icons/autoflip_2_9x16.mp4` were not present during the earlier check.

### Pair register update

The Task 70 output remains a candidate output associated with a historically
invoked input, not a verified matched source/output pair. The exact successful
run, processing configuration, and combined-pipeline provenance still need
confirmation.

**Evidence status:** Input invocation observed; output linkage and processing
provenance UNVERIFIED.

**Release decision:** BLOCKED - NO-GO pending the required evidence.

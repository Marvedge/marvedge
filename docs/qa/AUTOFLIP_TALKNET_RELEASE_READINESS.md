# AutoFlip + TalkNet Crop Pipeline — Release Readiness

**Task:** Task 42 — Document remaining known issues and limitations
**Scope:** AutoFlip crop targets, TalkNet speaker tracking, and their combined crop pipeline
**Status:** Release readiness not yet demonstrated
**Audit baseline:** Current Git `HEAD`; uncommitted working-tree changes are not treated as merged integration.

## 1. Purpose

Record the known release-readiness gaps in the AutoFlip + TalkNet crop pipeline and define the minimum evidence required before the combined pipeline can be considered good enough to ship.

This document distinguishes confirmed gaps from risks that still require testing. A missing validation result must not be interpreted as proof that the pipeline fails—or that it works correctly.

## 2. Known gaps and limitations

### GAP-01 — End-to-end integration is not confirmed in current HEAD

**Status:** Confirmed gap in the audited HEAD
**Release impact:** Blocker for claiming the combined pipeline is validated

The repository audit did not identify an end-to-end workflow in current HEAD that combines TalkNet speaker tracking with AutoFlip crop targets and verifies the resulting crop trajectory.

The AutoFlip and TalkNet service implementations exist separately. A documented crop-coordinate contract does not by itself prove that the two outputs are integrated and consumed correctly by the rendering pipeline.

**Required before release:**
- Confirm the data contract between speaker detections and crop targets.
- Demonstrate the complete flow from input video through tracking/crop generation to rendered output.
- Add integration coverage for successful processing and failure handling.

**Audit note:** Uncommitted files, including `ml-gateway/crop_fusion.py` and related tests, must be reviewed separately. Their presence in the working tree does not mean the integration is part of current HEAD or merged.

### GAP-02 — Insufficient real long-form regression samples

**Status:** Known validation gap
**Release impact:** Blocker for a broad real-world quality claim

At least five real long-form regression samples are not available for this validation effort. Therefore, combined cropping quality and real-world reliability cannot yet be fully assessed.

Short clips or unit tests alone cannot establish performance on long recordings with speaker changes, pauses, camera movement, and changing scene composition.

**Required before release:**
- Run at least five representative real long-form samples through the combined pipeline.
- Preserve input details, expected behavior, output artifacts, and observed failures.
- Include cases with speaker changes, multiple people, movement, and difficult framing.
- Record any skipped, timed-out, or failed samples rather than silently excluding them.

### GAP-03 — Incorrect or unstable cropping

**Status:** Risk requiring combined-pipeline validation
**Release impact:** Blocker if it repeatedly hides the intended subject

Potential failure modes include:
- The active speaker's face or head is clipped.
- The crop follows a secondary person or irrelevant object.
- Crop targets move too abruptly or oscillate.
- Framing reacts too late to a speaker change.
- Important visual context is lost in portrait output.

These are validation targets, not claims that every failure has already been reproduced in the combined pipeline.

**Required before release:** Review rendered outputs and crop trajectories, including speaker transitions and scene changes. Record reproducible failures with timestamps.

### GAP-04 — Speaker tracking failures

**Status:** Risk requiring representative testing
**Release impact:** Blocker when tracking failures cause unacceptable framing

Potential difficult cases include:
- The speaker is briefly occluded or leaves the frame.
- Multiple people appear together.
- Faces are small, turned away, or poorly lit.
- The active speaker changes quickly.
- Tracking detections are missing or inconsistent.

**Required before release:** Verify behavior when detections are missing or ambiguous. The pipeline should fail safely or use a defined fallback instead of producing uncontrolled crop jumps.

### GAP-05 — Processing time limits

**Status:** Confirmed configuration; impact requires measurement
**Release impact:** Conditional blocker for supported long-form inputs

The audited source defines these defaults:

- AutoFlip download timeout: 60 seconds (`DOWNLOAD_TIMEOUT_SEC`)
- AutoFlip processing timeout: 150 seconds (`AUTOFILP_TIMEOUT_SEC`)
- TalkNet download timeout: 60 seconds (`DOWNLOAD_TIMEOUT_SEC`)
- TalkNet processing timeout: 150 seconds (`TALKNET_TIMEOUT_SEC`)

The values are configurable through environment variables. These limits may constrain large downloads, slow inputs, or long-form processing, but the audit alone does not prove that a particular video will time out.

**Required before release:**
- Measure download and processing duration on representative inputs.
- Record timeouts and confirm that failures return a clear error.
- Establish supported input-duration and file-size limits.
- Confirm whether production timeout settings are appropriate for those limits.

## 3. Proposed “good enough to ship” bar

The combined pipeline should not be declared release-ready until all required gates below have evidence.

| Gate | Minimum acceptance criterion |
|---|---|
| End-to-end integration | A reproducible test demonstrates TalkNet speaker tracking and AutoFlip crop targets working together through the intended rendering path. |
| Regression coverage | At least five representative real long-form samples are processed and reviewed. |
| Subject visibility | No unresolved critical failure that persistently crops out the intended speaker's face or head in the reviewed release set. |
| Framing stability | No unresolved severe crop jumps, oscillation, or delayed reframing that makes the output unusable. |
| Speaker transitions | Representative speaker changes and ambiguous/missing detections are tested; behavior and fallback are documented. |
| Reliability | Failures and timeouts are surfaced clearly; no silent success is reported for incomplete processing. |
| Performance | Download and processing durations are recorded against documented supported input limits. |
| Reproducibility | Test inputs, results, known failures, and the tested code revision are recorded. |

These are proposed release criteria for this task, not a claim that the pipeline currently passes them. Any quantitative quality target should be agreed with the project owner and measured consistently before being used as a release threshold.

## 4. Release decision

**Current recommendation: Not yet validated for release as a combined AutoFlip + TalkNet crop pipeline.**

The principal reasons are:
1. End-to-end integration was not identified in the audited current HEAD.
2. Five or more real long-form regression samples are not available for full combined-quality validation.
3. Cropping, tracking, framing, and timeout behavior still require representative end-to-end evidence.

This decision does not mean the individual AutoFlip or TalkNet services are necessarily unusable. It means the available evidence is insufficient to certify the combined pipeline against the release bar above.

## 5. Evidence and audit boundaries

The audit inspected AutoFlip and TalkNet service configuration, repository references, and the current working-tree status.

The configured timeout defaults are recorded from:
- `autoflip/service.py`
- `talknet/service.py`

The absence of a combined integration refers specifically to the audited Git HEAD. Uncommitted implementation and test files must be assessed separately before drawing conclusions about the current working tree.

Update this document when integration tests and real long-form regression results become available. Record the tested revision and any remaining exceptions before changing the release recommendation.

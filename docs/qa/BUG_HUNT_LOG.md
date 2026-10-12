# Marvedge Bug Hunt Log

**Purpose:** Centralized record of reproducible defects and potential issues found during codebase investigation.

## Status definitions

- **Suspected:** Static inspection suggests a defect; reproduction is pending.
- **Confirmed:** A reproducible failure or defect has been demonstrated.
- **Fixed:** A code change has been made to address the defect.
- **Verified:** Regression tests confirm the fix.

## Bug Summary

| ID | Component | Finding | Severity | Status |
|---|---|---|---|---|
| BUG-001 | AVS dubbing / Cloudinary upload | Temporary directory remained after a failed local-artifact download | Low — provisional | Verified |

---

## BUG-001 — Temporary directory cleanup skipped on download failure

- **Component:** `app/lib/avs/dubbingProcessor.ts`
- **Function:** `defaultUploadToCloudinary()`
- **Status:** Verified
- **Severity:** Low — provisional; reassess based on operational impact.

### Observation

Temporary-directory creation and local-artifact downloading originally occurred before the `try...finally` block responsible for cleanup.

### Impact

If downloading, reading the response body, or writing the temporary file failed, the temporary directory could remain on disk.

### Reproduction evidence

Test file: `app/lib/avs/dubbingProcessor.cleanup.test.ts`

Before the fix, the regression test forced `fetch()` to reject with `simulated download failure`. The temporary directory still existed, and the cleanup assertion failed.

### Fix implemented

Moved temporary-directory creation, downloading, and file writing inside the existing `try...finally` cleanup boundary.

The original URL detection, Cloudinary configuration, upload parameters, response validation, and returned URL behavior were preserved.

### Verification evidence

- `npx vitest run app/lib/avs/dubbingProcessor.cleanup.test.ts` — 1 test passed.
- `npx vitest run app/lib/avs/dubbingProcessor.test.ts app/lib/elevenlabs/dubbing.test.ts` — 27 tests passed across 2 files.
- `git diff --check` — passed.

### Remaining validation

The tests verify the simulated download-failure cleanup path and existing dubbing regressions. Real Cloudinary uploads and live-service integration were not tested as part of this fix.

---

## Investigation-002 — AVS dubbing worker fallback and callback handling

- **Component:** `video-worker/index.ts`, `app/lib/avs/dubbingProcessor.ts`, `app/api/jobs/callback/route.ts`
- **Status:** Investigated — no confirmed defect
- **Severity:** Not assigned

### Observation

Reviewed the AVS dubbing worker's final-attempt detection, source-video fallback payload, callback retry behavior, and receiving API route.

### Findings

- The worker determines the final attempt using `job.attemptsMade + 1 >= maxAttempts`, consistent with the retry convention used elsewhere in the worker code.
- On a final-attempt dubbing failure, the worker can submit a completion callback using the original source video URL, provided the required job ID and video URL are available.
- The callback route validates the fallback video URL and duration and supports persisting the fallback metadata, including `fallback`, `fallbackStage`, `fallbackReason`, and `attemptsMade`.
- The callback route protects completed and cancelled jobs from being overwritten.
- If the fallback callback itself fails, the worker propagates an aggregate error containing the original processing error and callback error.

### Coverage gap

Existing tests cover related retry behavior, dubbing worker behavior, and callback/API handling, but the worker-level final-attempt fallback branch and its callback-failure path do not have dedicated direct test coverage.

### Conclusion

Static inspection indicates that the worker fallback payload and receiving callback contract are compatible. No production defect was demonstrated during this investigation, so no production code change is justified by the current evidence.

### Recommended follow-up

Add focused worker-level tests for final-attempt fallback, non-final-attempt failure propagation, missing fallback inputs, and fallback callback failure. Keep real-service and end-to-end fallback validation separate from unit-test verification.
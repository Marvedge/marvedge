# Week 5 Bug Bash — Triage Report

**Document:** `docs/qa/BUG_BASH_TRIAGE.md`
**Task:** Task-00087 — Pull the open must-fix list from the week 5 bug bash and sort it into "must fix before launch" and "acceptable to ship and improve later"
**Sprint:** Sprint 2 — Hardening & Production Readiness
**Author:** Aaditya Agarwal
**Status:** ✅ Final — based on `origin/master` as of 07 Oct 2026

---

## How This Was Built

All bugs catalogued below were pulled directly from the commit log on `origin/master` between 01 Oct 2026 and 07 Oct 2026, covering PRs #440–#454 produced during the Week 5 bug bash. Each item is cross-referenced against the fix branch, PR number, and current test-suite status.

---

## ✅ ALREADY FIXED — Closed During Bug Bash

These were identified and merged to `master` during the week. Listed for completeness and audit trail.

| # | Bug | Area | PR | Fix Commit |
|---|-----|------|----|------------|
| 01 | SSRF: dubbing source URLs were not validated against `isSafeUrl`, allowing internal network requests | Security / Dubbing | #441 | `df59a0b` |
| 02 | SSRF: GCS object resolution endpoint had no origin authorization check | Security / GCS | #440 | `1a43b6b` |
| 03 | SSRF: `/api/subtitles/create` passed `videoUrl` to worker without `isSafeUrl` gating | Security / Subtitles | #447 | `802f09e` |
| 04 | SSRF: `/api/avs/sync` passed both `videoUrl` and `audioUrl` without `isSafeUrl` gating | Security / AVS | #448 | `91448a8` |
| 05 | Free-trial export check had a race condition — concurrent requests could both pass the paywall guard | Paywall / Billing | #449 | `33c279c` |
| 06 | Internal server errors leaked raw worker hostnames (e.g. `video-worker-abc123-uc.a.run.app`) in `500` HTTP bodies | Info Leakage | #451 | `ede9ef1` |
| 07 | Tutorial slide upload: no cap on slide count, file size, or image MIME type — DoS vector | Tutorials / Upload | #450 | `165c767` |
| 08 | Tutorial upload: no per-user rate limiting and no base64 length guard — Bug 0031 repro at 100 slides | Tutorials / Security | #454 | `f33e071` |
| 09 | Tutorial internal errors leaked raw messages to the client | Tutorials / Info Leakage | #437 | `e363ee7` |
| 10 | FFmpeg URL safety bypass: `processChunkJob` passed `videoUrl` to FFmpeg directly without `isSafeUrl` | Security / Worker | #453 | `435afe0` |
| 11 | Pipeline failure recovery: `dubbingProcessor`, `clips/jobs`, `gcpWorker` did not handle transient GCP errors; partial failures hard-crashed the pipeline | Pipeline Reliability | #452 | `584c6ab` |
| 12 | `cloudrun-worker/**` was excluded from Vitest — `npm run test:avs` returned exit code 1 with "No test files found" | CI / Testing | #439 | `7487e1e` |
| 13 | `scripts/ml` and `ml-worker` preprocessing paths were out of sync — GPU batching and multi-speaker tracking hardening not parity-matched | MLOps / Preprocessing | #439 | `01d3c9e` |

---

## 🔴 MUST FIX BEFORE LAUNCH

These are open issues that are **blocking or directly risky for production**. They must be resolved and merged before any v3 launch gate.

---

### BUG-M01 — `/api/avs/dub` accepts FREE-plan users with no error (Plan Gate Missing)

**Severity:** Critical  
**Area:** Billing / Access Control  
**Status:** Open — no fix branch exists  

**Description:**  
`/api/avs/dub` (Task-83) fetches `user.plan` from the database (`select: { id: true, plan: true }`) but never evaluates it. A FREE-plan user can successfully submit dubbing jobs, bypassing the PRO/ENTERPRISE paywall entirely. The `dub.test.ts` suite explicitly asserts a `403` response for FREE users with the message `"PRO and ENTERPRISE"`, but the route does not return this — it returns `200 OK`.

**Evidence:**
```
route.ts:174  select: { id: true, plan: true }
→ user.plan is fetched but never checked after this line
→ dub.test.ts: expects 403 for FREE users → route returns 200
```

**Fix Required:**  
Add a plan gate immediately after the `if (!user)` guard in `app/api/avs/dub/route.ts`:
```ts
if (!["PRO", "ENTERPRISE"].includes(user.plan ?? "")) {
  return NextResponse.json(
    { error: "Dubbing is available on PRO and ENTERPRISE plans" },
    { status: 403 }
  );
}
```
Also resolve the conflict between `dub.test.ts` and `route.test.ts` — the two test files currently hold opposite expectations for FREE-user behavior.

---

### BUG-M02 — `route.test.ts`: 3 tests hanging on timeout (5000 ms)

**Severity:** High  
**Area:** Testing / AVS Dubbing  
**Status:** Open — affects CI

**Description:**  
Three tests in `app/api/avs/dub/route.test.ts` hang until the 5-second Vitest timeout:
1. `allows a signed-in FREE user to create a dubbing job`
2. `creates a VideoJob with kind AVS_DUB and returns jobId on valid request`
3. *(plan gate assertion failure)*

**Root Cause:**  
`runDubAlignment` is called as a `void` fire-and-forget inside the POST handler, but the tests mock `prisma.videoJob.findUnique` which is called inside `runDubAlignment`. Because the mock is not set up in the test's Prisma mock object, the unresolved promise hangs indefinitely. The test suite's Prisma mock is missing `videoJob.findUnique`.

**Fix Required:**  
Add `videoJob.findUnique: vi.fn()` to the `vi.mock("@/app/lib/prisma")` block, and mock `dubbingQueue.add` to resolve immediately so the fire-and-forget path completes in the test environment.

---

### BUG-M03 — `DEFAULT_TARGET_LANGUAGE` silently hardcoded to `"ta"` (Tamil)

**Severity:** High  
**Area:** Dubbing / Localization  
**Status:** Open — no fix branch exists

**Description:**  
In `app/api/dubbing/create/route.ts`, when a caller omits `targetLanguage` from the request body, the API silently falls back to Tamil (`"ta"`). There is no validation error, no warning logged, and no client-side feedback. Any non-Tamil user who omits this field will receive a silently mislabeled dubbing job.

**Fix Required:**  
Either make `targetLanguage` a required field (return `400` if absent) or log a `console.warn` and document the fallback explicitly. The current silent fallback is a correctness bug for any non-Tamil workflow.

---

## 🟡 ACCEPTABLE TO SHIP — Fix in v3.1 / Post-Launch

These are real issues but they do not block the initial launch. They should be triaged into the backlog with documented acceptance criteria.

---

### BUG-S01 — `scripts/ml/preprocess_faces.py`: `iouThres = 0.1` (too low, identity hopping in crowded scenes)

**Severity:** Medium  
**Area:** ML / Preprocessing  
**Status:** Functionally working but sub-optimal

**Description:**  
The `track_shot` function in `scripts/ml/preprocess_faces.py` uses `iouThres = 0.1` while `ml-worker/preprocess_faces.py` uses `iouThres = 0.5`. The lower threshold allows a new detection 10% overlapping an existing track to be assigned to it, causing identity hopping in multi-speaker scenes with close proximity. The production worker is correct (0.5), but the test scripts still carry the old value.

**Acceptance criteria for fix:** Align both files to `iouThres = 0.5` and add a test that fails at 0.1 but passes at 0.5 for a proximity scenario.

---

### BUG-S02 — `crop_video` in `scripts/ml/preprocess_faces.py` has a duplicate/stale `return` statement

**Severity:** Low  
**Area:** ML / Preprocessing  
**Status:** Code smell — dead code after early return

**Description:**  
`crop_video` in the scripts path returns the `is_fallback`-enriched dict at line ~380 and then has a second unreachable `return {'track': track, 'proc_track': dets}` in the ml-worker version. The dead return drops the `is_fallback` key. Not triggered in normal flow but will surface if the function is ever refactored.

---

### BUG-S03 — AVS dub plan gate conflict between test files is unresolved product decision

**Severity:** Medium (process)  
**Area:** Product / Access Control  
**Status:** Needs product sign-off, not a code bug

**Description:**  
`dub.test.ts` (legacy) expects FREE users → `403`. `route.test.ts` (week 5) expects FREE users → `200`. The team has not aligned on the product decision. Once BUG-M01 is resolved this will auto-close, but the product intent needs to be locked in Notion before the fix is merged.

---

### BUG-S04 — `scenedetect` v4 API used in `scripts/ml/`, legacy v3 API used in `ml-worker/`

**Severity:** Low  
**Area:** MLOps / Dependencies  
**Status:** Functionally working via graceful fallback

**Description:**  
`scripts/ml/preprocess_faces.py` uses the modern `from scenedetect import detect` API (v4). `ml-worker/preprocess_faces.py` still imports `VideoManager`, `SceneManager`, `StatsManager` from the v3 API. v3 is deprecated. The worker now has a `HAS_SCENEDETECT` guard so it degrades gracefully, but it should be upgraded to the v4 API for consistency and future-proofing.

---

### BUG-S05 — No end-to-end smoke test for the dubbing plan gate

**Severity:** Medium  
**Area:** Testing  
**Status:** Test gap — no regression coverage

**Description:**  
There is no Playwright or integration test that verifies the dubbing paywall from the UI. A FREE user attempting to dub should see a clear upgrade prompt. This is untested at the browser level and needs to be added to the regression checklist before launch.

---

## Summary Table

| ID | Title | Category | Severity | Status |
|----|-------|----------|----------|--------|
| M01 | `/api/avs/dub` — plan gate missing, FREE users bypass paywall | Billing | 🔴 Critical | **Open** |
| M02 | `route.test.ts` — 3 tests timing out (missing `findUnique` mock) | Testing / CI | 🔴 High | **Open** |
| M03 | `DEFAULT_TARGET_LANGUAGE = "ta"` silent fallback in dubbing | Localization | 🔴 High | **Open** |
| S01 | `iouThres = 0.1` in scripts/ml vs `0.5` in ml-worker | ML Quality | 🟡 Medium | Backlog |
| S02 | Dead `return` statement in `crop_video` | Code Quality | 🟡 Low | Backlog |
| S03 | Plan gate intent not locked between `dub.test.ts` and `route.test.ts` | Product Process | 🟡 Medium | Needs sign-off |
| S04 | `ml-worker` still uses deprecated scenedetect v3 API | MLOps / Deps | 🟡 Low | Backlog |
| S05 | No Playwright smoke test for dubbing paywall from UI | Testing Gap | 🟡 Medium | Backlog |

**Must fix before launch: 3 open items (M01, M02, M03)**  
**Acceptable to ship and improve later: 5 items (S01–S05)**

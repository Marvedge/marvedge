# Task-00085 Bug Bash

## Environment

| Key | Value |
|---|---|
| Branch | `task/task-00085-bug-bash` |
| Date | 2026-10-01 |
| Next.js | 15.5.26 |
| Node | v24.13.1 |
| npm | 11.8.0 |
| Docker | 29.7.2 |
| Docker Compose | v5.5.0 |
| Redis | Running — `docker exec marvedge-redis redis-cli ping` => `PONG` |
| ML Gateway | `http://localhost:8000` — **Returns HTTP 503** on `GET /health` |
| AutoFlip | Running (container: `marvedge-autoflip`) — `GET /health` => `{"status":"ok"}` HTTP 200 |
| TalkNet | Running (container: `marvedge-talknet`) — `GET /health` => `{"status":"degraded","cuda_available":false,"weights":{"s3fd":false,"model":false}}` HTTP 200 |
| GCP Video Worker | **NOT running** — `GCP_VIDEO_WORKER_URL=http://localhost:8080` — Port 8080 refused |
| OpenAI | Not reachable from this environment (Script rewrite 502) |
| AVS Feature Flag | `AVS_ENABLED=true`, `NEXT_PUBLIC_AVS_ENABLED=true` |

---

## Pre-existing Observations

### OBS-001 — ML Gateway returns HTTP 503 on GET /health despite all downstream services responding HTTP 200

**Expected:**
`GET http://localhost:8000/health` returns HTTP 200 with `{"status":"ok"}` or `{"status":"degraded"}` in the response body.

**Observed:**
`GET http://localhost:8000/health` returns HTTP **503 Service Unavailable** with body:
```json
{"status":"degraded","services":{"autoflip":"healthy","talknet":"degraded"}}
```
ML Gateway logs show both upstream health checks succeed:
```
HTTP Request: GET http://autoflip:8000/health "HTTP/1.1 200 OK"
HTTP Request: GET http://talknet:8000/health  "HTTP/1.1 200 OK"
```

**Root cause (observed, not fixed):**
The ML Gateway `check_service_health()` function (`ml-gateway/server.py` L40-60) reads the `status` field in the downstream JSON body. TalkNet returns `{"status":"degraded",...}`, so the gateway classifies it as `"degraded"`. When any service is degraded, the gateway responds HTTP 503, even though both services actually responded 200 OK. The 503 is intentional gating behavior.

**TalkNet root cause (observed, not fixed):**
TalkNet is missing its ML weights. Raw response from inside the gateway container:
```json
{"status":"degraded","device":"cpu","cuda_available":false,"weights":{"s3fd":false,"model":false}}
```
`s3fd` and `model` weights are both `false` (not loaded). TalkNet is running but non-functional for inference.

**Impact on AVS pipeline:**
TalkNet is used for dubbing alignment (lip-sync). The dubbing stage backend route `/api/avs/dub` calls `invokeGcpDubSync` via the GCP Cloud Run worker — it does **not** call TalkNet directly. Previous AutoFlip `/reframe` requests all returned HTTP 200 and completed successfully. TalkNet's degraded status does not appear to block the AVS voiceover, script, captions, sync, or standard export stages. Impact limited to dubbing inference quality if TalkNet were invoked.

**Evidence:**
- `docker logs marvedge-ml-gateway` — `GET /health HTTP/1.1 503 Service Unavailable`
- `docker exec marvedge-ml-gateway python -c "..."` — TalkNet returns `status: degraded, weights: {s3fd: false, model: false}`
- `GET http://localhost:8000/health` response body

---

### OBS-002 — GCP Cloud Run worker is not running locally

**Expected:**
`GCP_VIDEO_WORKER_URL=http://localhost:8080` is reachable and handles `/avs-voiceover`, `/subtitles`, `/avs-sync`, `/avs-dub`, and `/process` endpoints.

**Observed:**
Port 8080 is not listening:
```
WARNING: TCP connect to (::1 : 8080) failed
WARNING: TCP connect to (127.0.0.1 : 8080) failed
```

**Impact:**
All stages that invoke the GCP worker — Voiceover, Captions, Sync, and Export — fail with `"fetch failed"` errors. This is **the primary cause of pipeline-wide failures** in this environment. It is not a bug in application code; it is an environmental gap.

---

### OBS-003 — REFRAME job stuck in PENDING since 2026-10-01T11:27 UTC

**Observed:**
Job `cmupg8vo10001vyn017b37dwy` (kind: `REFRAME`, targetAspectRatio: `9:16`) was created at 11:27 UTC and remains in `PENDING` status with `progress: 0`. This job has been pending for the entire duration of the bug bash session with no transition.

**DB evidence:**
```json
{
  "id": "cmupg8vo10001vyn017b37dwy",
  "status": "PENDING",
  "progress": 0,
  "jobData": {"kind":"REFRAME","source":{"width":1280,"height":720},"targetAspectRatio":"9:16"},
  "error": null
}
```

**Impact:** Unknown. Could indicate the Reframe polling callback was never received (worker offline), or the job was enqueued and the worker was restarted before it was picked up. Requires follow-up.

---

## Test Run

### RUN-001 — Authenticated End-to-End Pipeline Audit

**Input:**
- Test user: `ajitkumarshankhwar25@gmail.com` (plan: `PRO`)
- Source video: `https://res.cloudinary.com/dh2skqoub/video/upload/v1773151729/w3tomxbe39rpcdfpkb0b.webm` (duration: 4.17s)
- Session: JWT token minted with `NEXTAUTH_SECRET`; `GET /api/auth/session` verified => 200, correct user email returned
- Date/time: 2026-10-01T11:43 UTC

| Stage | Result | Notes |
|---|---|---|
| Steps / Scene | **PASS** (logic only) | Client-side derivation; no network call required. `deriveSteps` + `resolveClickTimes` verified by source inspection. Fallback to 1 full-length step when no click events are present. Unit tests: all pass. |
| Script rewrite | **FAIL** — HTTP 502 | `POST /api/avs/script` => `{"error":"Failed to rewrite script"}`. OpenAI unreachable. Graceful fallback confirmed in `useAvsPipeline.ts` L320-327 (continue with seeded narration). **Non-fatal per design.** |
| Voiceover | **FAIL** — HTTP 502 | `POST /api/avs/voiceover` => `{"error":"Failed to generate voiceover"}`. GCP worker not running. Pipeline stops here as designed (voiceover is required). |
| Captions | **FAIL** — job FAILED | `POST /api/subtitles/create` => 200 with `jobId`. First poll => HTTP 500 (BUG-001). Second poll => `state=failed, error="fetch failed"`. GCP worker not running. **Non-fatal per design.** |
| Time Alignment / Sync | **FAIL** — job FAILED | `POST /api/avs/sync` => 200 with `jobId`. Polls: `state=active, progress=20` x2, then `state=failed, error="fetch failed"`. GCP worker not running. Fatal to pipeline per design. |
| Export | **FAIL** — job FAILED | `POST /api/jobs/create` => 200 with `jobId`. First poll => HTTP 500 (BUG-001). Then `state=active, progress=25`, then `state=failed, error="fetch failed"`. GCP worker not running. Fatal to pipeline per design. |
| Dubbing UI | **BLOCKED** | Frontend unavailable to tester. See BLOCKED-001. |
| Dubbing backend | **FAIL — BUG** | See BUG-002. Job permanently stuck in PROCESSING. Fallback path does not fire. |

---

## Confirmed Bugs

### BUG-001 — /api/jobs/[id] returns HTTP 500 on the first poll immediately after job creation

**Stage:** All async stages (Captions, Export, Dubbing)

**Severity:** Medium

**Preconditions:**
- Authenticated user (PRO plan)
- Any job created via `/api/subtitles/create`, `/api/jobs/create`, or `/api/avs/dub`
- First poll issued within ~500ms of job creation

**Steps to reproduce:**
1. POST to `/api/subtitles/create` (or `/api/jobs/create` or `/api/avs/dub`) — receive `jobId`
2. Immediately GET `/api/jobs/{jobId}` — observe HTTP 500

**Expected:**
`GET /api/jobs/{jobId}` always returns HTTP 200 with `{state: "waiting", progress: 0}` for a newly created PENDING job.

**Actual:**
First poll returns HTTP 500 (`{"error":"Internal Server Error"}`). Second poll 1-2 seconds later returns HTTP 200 normally.

**Reproducible:** Yes — observed consistently across 3 different job types:
- Captions job `cmupgu8ut`: Poll 1 => 500, Poll 2 => 200/failed
- Export job `cmupguuo4`: Poll 1 => 500, Poll 2 => 200/active
- Dubbing job `cmupgv7jx`: Poll 1 => 500 (then stuck — see BUG-002)

**Evidence:**
- `scratch/test_pipeline_authenticated.js` console output
- `/api/jobs/[id]/route.ts` L130-133: `catch` block returns HTTP 500 on any exception — exact exception not surfaced to caller

**Suspected area:**
Race condition between the POST route dispatching the job via Next.js `after()` and the GET route reading from DB. The job row may not be committed/visible within the first ~500ms. The route has no 404-to-202 grace path or retry for the PENDING-not-yet-visible window.

---

### BUG-002 — AVS Dubbing job (AVS_DUB) permanently stuck in PROCESSING — fallback path never fires

**Stage:** Dubbing (backend)

**Severity:** High

**Preconditions:**
- Authenticated PRO user
- `GCP_VIDEO_WORKER_URL` points to an unreachable host (localhost:8080 with no worker)
- `POST /api/avs/dub` called with valid input

**Steps to reproduce:**
1. Ensure GCP worker is not running
2. Authenticated `POST /api/avs/dub` with valid `videoUrl`, `dubUrl`, `steps`, `dubTimings`, `sourceDuration`
3. Observe `jobId` returned, HTTP 200
4. Poll `GET /api/jobs/{jobId}` repeatedly

**Expected (per Task-00083 documented fallback):**
When `invokeGcpDubSync` fails (worker down, fetch fails), `runDubAlignment` catches the error and calls `prisma.videoJob.updateMany` to set `status: "COMPLETED"` with `fallback: true` and `fallbackReason`. Job should transition to `completed` within seconds.

**Actual:**
Job remains in `state: "active"`, `progress: 20` indefinitely. After 8 polls (~12 seconds) the job never transitions:
```
[Poll 1] state=active, progress=20
[Poll 2] state=active, progress=20
...
[Poll 8] state=active, progress=20
```
Direct DB inspection confirms `status: "PROCESSING"` with no update, no error field populated:
```json
{
  "id": "cmupgv7jx0009vyn0zf3j9jje",
  "status": "PROCESSING",
  "progress": 20,
  "jobData": {"kind": "AVS_DUB"},
  "exportedUrl": null,
  "error": null
}
```

**Comparison:**
The `runDubAlignment` DB update logic is correct in isolation — when triggered directly in a script (`scratch/test_dub_db.js`), it transitions the job to COMPLETED with full fallback metadata. The fallback DB write path works when called synchronously.

**Suspected cause:**
`runDubAlignment` is dispatched via Next.js `after()` in the POST handler (`/api/avs/dub/route.ts` L62). When the GCP worker is unreachable (`fetch failed`), `invokeGcpDubSync` may throw before `runDubAlignment`'s catch block is reached, or the `after()` task may crash before the catch executes. Because `after()` runs outside the request lifecycle, any unhandled exception does not surface to the client. The DB row is left in PROCESSING permanently.

**Key risk:** The frontend `pollJob` in `useAvsPipeline.ts` polls up to 240 iterations (~10 minutes). A permanently stuck PROCESSING job means the UI shows "Generating..." for the full 10 minutes before timing out.

**Reproducible:** Yes — every `/api/avs/dub` call in this environment reproduces the stuck state.

**Evidence:**
- `scratch/test_pipeline_authenticated.js`: 8 consecutive polls returning `state=active`
- `scratch/check_job.js` DB query: `status: "PROCESSING"` unchanged after minutes
- `scratch/test_dub_db.js`: direct DB update to COMPLETED with fallback metadata works correctly
- `app/api/avs/dub/route.ts` L62: `runDubAlignment` called via `after()`

---

### BUG-003 — e2e/auth-ui.spec.ts Playwright test is picked up by Vitest and causes suite failure

**Stage:** Test infrastructure

**Severity:** Low (CI cleanliness)

**Steps to reproduce:**
1. `npx vitest run` from workspace root
2. Observe failure in `e2e/auth-ui.spec.ts`

**Expected:**
`e2e/auth-ui.spec.ts` is a Playwright E2E test and should only run under Playwright, not Vitest.

**Actual:**
Vitest picks up the file and calls `test.describe()` from `@playwright/test`, which throws:
```
Error: Playwright Test did not expect test.describe() to be called here.
 at e2e/auth-ui.spec.ts:3:6
```

**Result:** `vitest run` exits with code 1 (2 failed test files out of 61).

**Suspected area:** Vitest `include` glob in `vitest.config.*` does not exclude the `e2e/` directory.

---

### BUG-004 — cloudrun-worker/avs_dub.test.js calls process.exit() which Vitest treats as failure

**Stage:** Test infrastructure

**Severity:** Low (CI cleanliness)

**Steps to reproduce:**
1. `npx vitest run` from workspace root
2. Observe failure in `cloudrun-worker/avs_dub.test.js`

**Expected:** Test file completes and Vitest collects results normally.

**Actual:**
Test file calls `process.exit(failed > 0 ? 1 : 0)` at L180, which Vitest intercepts:
```
Error: process.exit unexpectedly called with "0"
 at cloudrun-worker/avs_dub.test.js:180:9
```

**Suspected area:** `cloudrun-worker/avs_dub.test.js` uses a hand-rolled test harness with `process.exit()` that predates Vitest adoption. Should be excluded from the Vitest glob or rewritten without `process.exit()`.

---

## Suspected / Needs Investigation

### SUSPECT-001 — /api/jobs/[id] HTTP 500 during polling — exact exception not captured

The first-poll HTTP 500 (BUG-001) requires Next.js server stdout capture at the moment of failure to determine whether it is a pure race condition vs a thrown exception in `getAwsJobProgress` or elsewhere. The `catch` block at `route.ts` L130 returns HTTP 500 on any error without distinguishing race from logic failure.

**Needs:** Capture Next.js stdout at the exact moment of first-poll 500 to confirm exception type.

---

### SUSPECT-002 — TalkNet weights missing — unclear if expected in dev

TalkNet starts but reports `s3fd: false` and `model: false`. Unclear whether the dev Docker image is expected to ship without weights (with download at runtime) or if the download failed silently.

**Needs:** Check `docker logs marvedge-talknet --tail 100` for weight download errors. Confirm whether weights are volume-mounted vs downloaded at build/start time.

---

### SUSPECT-003 — Stuck PENDING REFRAME job with no self-recovery

A REFRAME job from 2026-10-01T11:27 UTC remains `PENDING` indefinitely. No error is recorded, no expiry mechanism is visible.

**Needs:** Confirm whether a dead-letter / expiry mechanism exists for permanently-pending jobs, and whether the Reframe flow has a client-side timeout that should have marked this job failed.

---

### SUSPECT-004 — XSS-payload URL stored in Demo.videoUrl

**Observed in DB:**
```json
{
  "id": "2d477e22-7e91-4c99-9e12-2ddf0b41854c",
  "title": "URL Test",
  "videoUrl": "javascript:alert('XSS-URL')"
}
```

A demo record with a `javascript:` scheme URL exists in the database. Likely from a past security probe test. **Not confirmed as an exploitable XSS** — only a risk if this URL is rendered as an unguarded `href` or `src`. The record's existence suggests `javascript:` scheme validation was absent at the time of creation or was manually inserted.

**Needs:** Audit current `videoUrl` save paths to confirm `javascript:` scheme is rejected. Confirm whether `safeUrl` utilities cover all editor URL inputs.

---

## Blocked Tests

### BLOCKED-001 — Dubbing UI unavailable

**Reason:**
The current frontend at `http://localhost:3000/editor` does not expose a Dubbing UI panel. The AVS panel shows Steps, Script, Voiceover, Captions, and the one-click Pipeline button only.

**Impact:**
Frontend E2E validation of the dubbing stage cannot be completed — including browser-side polling behavior, UI state transitions, fallback metadata rendering, and exported URL propagation.

**Backend status (verified):**
- `POST /api/avs/dub` creates a `VideoJob` with `kind: AVS_DUB` and returns `jobId` — verified
- `runDubAlignment` fallback path passes all 13 unit tests in `app/api/avs/dub/route.test.ts` — verified
- **However**: BUG-002 shows the fallback does NOT fire in the live `after()` dispatch path

**Required dependency:** Dubbing frontend/UI availability from the frontend/full-stack owner.

---

### BLOCKED-002 — Full end-to-end pipeline run impossible without GCP Cloud Run worker

**Reason:**
GCP Cloud Run worker (`localhost:8080`) is not running. Stages 3 (Voiceover), 4 (Captions), 5 (Sync), and 6 (Export) all depend on it.

**Impact:**
- Voiceover synthesis not testable end-to-end
- Caption generation polling: partially verified (job created, polled, FAILED confirmed)
- Sync: not testable beyond job creation
- Export: not testable beyond job creation
- `aligned` field propagation from Sync to Export: not verifiable

**Required dependency:** Start the local Cloud Run worker or point `GCP_VIDEO_WORKER_URL` at a deployed staging instance.

---

### BLOCKED-003 — Script rewrite not testable end-to-end (OpenAI unreachable)

**Reason:**
`POST /api/avs/script` returns HTTP 502. `OPENAI_API_KEY` is present in `.env.local` but OpenAI is not reachable from this session's network.

**Impact:**
Script rewrite stage cannot be verified end-to-end. Graceful fallback (continue with seeded narration) is confirmed correct by code inspection (`useAvsPipeline.ts` L320-327).

**Required dependency:** OpenAI API reachability, or a local mock endpoint.

---

## Polling Audit

| Check | Captions | Sync | Export | Dubbing |
|---|---|---|---|---|
| Job ID returned by POST | YES | YES | YES | YES |
| Frontend polls via `pollJob()` | YES (hook verified) | YES | YES | YES |
| Polling stops on `completed` | YES (code) | YES (code) | YES (code) | YES (code) |
| Polling stops on `failed` | YES (observed) | YES (observed) | YES (observed) | **NO — BUG-002** |
| Polling stops on `cancelled` | YES (code: CANCELLED=>"cancelled") | YES | YES | YES |
| First-poll HTTP 500 race | YES — BUG-001 | Not observed | YES — BUG-001 | YES — BUG-001 |
| Stuck in RUNNING after backend completes | N/A | N/A | N/A | **YES — BUG-002** |
| Timeout (240 x 2.5s = ~10 min) | YES (code) | YES (code) | YES (code) | Would timeout after ~10 min |
| UI shows useful error/warning on failure | Not tested (BLOCKED) | — | — | — |
| Final artifact URL propagated to next stage | Not testable (BLOCKED-002) | — | — | — |
| `MAX_POLLS` = 240 | confirmed in `useAvsPipeline.ts` L28 | — | — | — |
| `POLL_INTERVAL_MS` = 2500 | confirmed in `useAvsPipeline.ts` L27 | — | — | — |

---

## Final Summary

### 1. Infrastructure Status

| Service | Status |
|---|---|
| Next.js | Running, HTTP 200 on all checked routes |
| Redis | Running — PONG |
| PostgreSQL (via Prisma) | Reachable, data accessible |
| ML Gateway | Running but returns HTTP 503 (TalkNet degraded) |
| AutoFlip | Running, status: ok |
| TalkNet | Running but status: degraded (weights missing) |
| GCP Cloud Run Worker | NOT running — port 8080 refused — root cause of all pipeline stage failures |
| OpenAI | Not reachable in this session |

### 2. Stages Tested

Steps, Script, Voiceover, Captions, Sync, Export, Dubbing (backend only — UI BLOCKED)

### 3. Stages Passed

- **Steps**: PASS — logic verified, all unit tests pass
- **Script**: Expected graceful degradation correctly wired in code (OpenAI unreachable => fallback to seeded narration confirmed)

All other stages FAIL due to GCP worker offline (environmental). Dubbing additionally has BUG-002.

### 4. Confirmed Bugs

| ID | Title | Severity |
|---|---|---|
| BUG-001 | First poll on any new job returns HTTP 500 (race condition) | Medium |
| BUG-002 | AVS Dubbing job permanently stuck in PROCESSING — fallback never fires via after() | High |
| BUG-003 | e2e/auth-ui.spec.ts picked up by Vitest, causes suite failure | Low |
| BUG-004 | cloudrun-worker/avs_dub.test.js uses process.exit() incompatible with Vitest | Low |

### 5. Suspected Issues

| ID | Description |
|---|---|
| SUSPECT-001 | Exact root cause of first-poll 500 needs Next.js server log capture |
| SUSPECT-002 | TalkNet weights missing — may be expected dev behavior or silent download failure |
| SUSPECT-003 | REFRAME job stuck PENDING with no self-recovery or expiry |
| SUSPECT-004 | javascript:alert(...) URL stored in Demo.videoUrl — XSS probe data or validation gap |

### 6. Blocked Tests

| ID | Description |
|---|---|
| BLOCKED-001 | Dubbing UI — frontend not available to tester |
| BLOCKED-002 | Full pipeline E2E — GCP worker not running |
| BLOCKED-003 | Script rewrite E2E — OpenAI not reachable |

### 7. Evidence Collected

- `scratch/inspect_db.js` — DB user list, demo list, recent job list
- `scratch/find_demos.js` — Demos with valid duration
- `scratch/test_pipeline_audit.js` — Unauthenticated baseline (all 401, as expected)
- `scratch/test_pipeline_authenticated.js` — Full authenticated pipeline audit run output
- `scratch/test_single_poll.js` — Single-job poll confirming stuck `active` state for dubbing job
- `scratch/test_dub_db.js` — Direct DB write confirming fallback update logic works in isolation
- `scratch/check_job.js` — DB state dump of test jobs
- ML Gateway source: `ml-gateway/server.py` — health check logic verified
- AVS pipeline source: `useAvsPipeline.ts`, `route.ts` (all four AVS routes), `gcpWorker.ts`
- Vitest run: 59 files passed, 2 files failed (BUG-003, BUG-004); 1058 individual tests passed
- Docker logs: `marvedge-ml-gateway`, `marvedge-autoflip`, `marvedge-talknet`
- DB records: users (2 PRO users confirmed), test jobs created during this run

### 8. Items for Task-00086

1. **[HIGH] BUG-002** — Investigate why `runDubAlignment` fallback does not fire when dispatched via Next.js `after()`. Job left permanently in PROCESSING. Likely needs: explicit try/catch wrapping the `after()` body, or a watchdog that marks stale PROCESSING jobs as failed after a timeout.

2. **[MEDIUM] BUG-001** — Investigate the first-poll HTTP 500 race. Options: (a) add short retry in the poll client for 500s on the first 1-2 polls, (b) add DB read retry/grace period in the route handler, (c) distinguish 404 (job not yet visible) from actual 500 in the catch block.

3. **[LOW] BUG-003/004** — Update Vitest `include`/`exclude` config to exclude `e2e/` and `cloudrun-worker/avs_dub.test.js`; or refactor `avs_dub.test.js` to remove `process.exit()`.

4. **[INVESTIGATION] SUSPECT-003** — Add job expiry/watchdog for jobs stuck in PENDING or PROCESSING beyond a configurable threshold (e.g. 15 minutes).

5. **[INVESTIGATION] SUSPECT-004** — Audit `Demo.videoUrl` write paths to confirm `javascript:` scheme is rejected at the API level.

6. **[ENV UNBLOCK] BLOCKED-002** — Start or deploy GCP Cloud Run worker so the full pipeline can be exercised end-to-end.

7. **[ENV UNBLOCK] BLOCKED-001** — Make Dubbing UI available to testers so frontend E2E of the dubbing stage can be completed.

8. **[INFRA] TalkNet weights** — Confirm whether missing weights are expected dev behavior; if not, restore weights and document the process.

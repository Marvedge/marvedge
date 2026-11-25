# Integrated Video Pipeline Flow and Contract

> **Document Type:** Production Integration Architecture, Concrete API Contracts & Staging Status
> **Status:** Local code inspection, TypeScript type-check, and unit test suites verified | Cloud staging validation **PENDING — awaiting approved Dev worker, storage prefixes, and access confirmation from Sarthak**.
>
> Local unit/route tests do not establish end-to-end staging execution or production readiness.
>
> **Safety:** Do not upload test videos or start/stop cloud resources until staging approval and all required preflight checks are confirmed.
> **Last Updated:** 2026-11-18 (Task-00116 audit and contract reconciliation)

---

## 1. Executive Architecture & Flow Summary

The Marvedge video processing pipeline abstracts video reframing, caption/subtitle generation, dubbing audio alignment, and final export rendering across cloud microservices:

1. **Reframe Processing (AWS EC2 GPU):** Executes AI camera reframing using Google AutoFlip and TalkNet Active Speaker Detection (ASD) on the approved Dev GPU worker. The instance type and region are pending confirmation for Task 115. The worker is managed via FastAPI `ml-gateway` and consumed asynchronously from BullMQ (`reframe-processing`).
2. **Subtitle & Caption Generation (GCP Cloud Run):** Executes speech transcription, cue generation, and ASS styling via GCP Cloud Run subtitle worker services, persisting styled subtitles in `public/captions/<jobId>.ass` and structured cues in PostgreSQL.
3. **AVS Dubbing Alignment (GCP Cloud Run / BullMQ):** Executes speech-to-video pacing alignment, aligning an uploaded dub audio track with video step boundaries via `invokeGcpDubSync` or BullMQ (`dubbingQueue`, queue name `"dubbing-processing"`).
4. **Final Export Rendering (Cloud Run / BullMQ):** Encodes overlays, zooms, canvas frames, backgrounds, and subtitles into delivery MP4s via `POST /api/jobs/create`.

### Implemented vs. Automated Orchestration Reality

> [!IMPORTANT]
> **No Unified Backend Auto-Pipeline Exists Today:**
> The codebase implements decoupled microservices with dedicated routes (`/api/reframe`, `/api/subtitles/create`, `/api/avs/dub`, `/api/jobs/create`). There is no single endpoint or background supervisor that automatically chains `reframe` output directly into `subtitle` generation and `dubbing`.
>
> Cross-stage execution in production and staging currently requires **manual or client-driven sequencing**: an operator or client-side hook polls for stage $N$'s completion via `GET /api/jobs/<jobId>`, extracts the resulting URL (`exportedUrl` or `alignedVideoUrl`), and dispatches stage $N+1$.

```
[Input Video (S3/HTTP)] ──> POST /api/reframe ──> [BullMQ: reframe-processing] ──> [ML Gateway / GPU]
                                                                                            │
                                                          [Poll /api/jobs/:id] <────────────┘
                                                                    │
                                                           (Reframed Video URL)
                                                                    ▼
                                                        POST /api/subtitles/create ──> [Cloud Run Subtitles]
                                                                                            │
                                                          [Poll /api/jobs/:id] <────────────┘
                                                                    │
                                                        (.ass File & Subtitle Cues)
                                                                    ▼
[Dubbed Audio (.mp3)] ───> POST /api/avs/dub ───────> [BullMQ: dubbing-processing] ───> [Cloud Run Dub Sync]
                                                                                            │
                                                          [Poll /api/jobs/:id] <────────────┘
                                                                    │
                                                            (Aligned Video URL)
                                                                    ▼
                                                        POST /api/jobs/create ─────> [Cloud Run Merge / Export]
                                                                                            │
                                                          [Poll /api/jobs/:id] <────────────┘
                                                                    │
                                                            [Final Export MP4]
```

---

## 2. Stage Contracts & Detailed Behaviors

### 2.1 Stage 1: Video Reframing (`POST /api/reframe`)

- **Code References:**
  - Route: `app/api/reframe/route.ts:13-116`
  - Validation: `app/lib/reframe/validation.ts:22-49`
  - Service & Persistence: `app/lib/reframe/service.ts:50-70`
  - Worker Consumer: `reframe-worker/index.ts:31-70`
  - ML Gateway Client: `reframe-worker/client.ts:68-112`
  - ML Gateway Handler: `ml-gateway/server.py:195-340`

#### Authentication & Authorization
- Requires active NextAuth session (`getServerSession(authOptions)`). Unauthenticated requests return `401 { error: "Unauthorized" }`.
- If `demoId` is provided, verifies that `demo.userId === session.user.id`. Missing or unowned demo returns `404 { error: "Demo not found" }`.

#### Request Schema
```json
{
  "videoUrl": "s3://<APPROVED_DEV_RAW_BUCKET>/<APPROVED_DEV_INPUT_PREFIX>/sample.mp4",
  "targetAspectRatio": "9:16",
  "demoId": "cly..."
}
```
- `videoUrl`: Non-empty string satisfying `isSafeUrl(videoUrl)`. Allows `s3://`, `gs://`, `r2://`, and public `https://`.
- `targetAspectRatio`: Must be one of `"9:16"`, `"1:1"`, `"4:5"`, `"16:9"`. Defaults to `"9:16"`.
- `demoId`: Optional string.

#### Job Lifecycle & Execution Flow
1. Route creates a `VideoJob` row in PostgreSQL with `status: "PENDING"`, `progress: 0`, `kind: "REFRAME"`.
2. Job is enqueued to BullMQ queue `"reframe-processing"` with `jobId = jobRecord.id`.
3. Worker picks up job, sends `POST /reframe` (or `/reframe-combined`) to ML Gateway with custom header `x-gateway-token: <ML_GATEWAY_TOKEN>` (source: `process.env.ML_GATEWAY_TOKEN`).
4. ML Gateway runs AutoFlip / TalkNet models on EC2 GPU, writes reframed MP4 to storage, and returns result. Note: Gateway resolves AutoFlip via `AUTOFILP_SERVICE_URL` (spelling in `ml-gateway/server.py`).
5. Worker posts completion callback to `POST /api/jobs/callback` with `Authorization: Bearer <CALLBACK_SECRET>`.
6. Database updates `VideoJob.status = "COMPLETED"`, `progress = 100`, and sets `exportedUrl`.

#### Response Contract
- **Success (`HTTP 200`):**
  ```json
  {
    "success": true,
    "jobId": "cm...",
    "status": "pending"
  }
  ```

---

### 2.2 Stage 2: Subtitle Generation (`POST /api/subtitles/create`)

- **Code References:**
  - Route: `app/api/subtitles/create/route.ts:182-344`
  - GCP Worker Invocation: `app/lib/gcpWorker.ts:89-130`
  - Local Storage: `public/captions/<jobId>.ass`

#### Authentication & Authorization
Dual-mode authentication supported:
1. Internal Service Bearer Header: `Authorization: Bearer <CALLBACK_SECRET>`
2. NextAuth Session: `getServerSession(authOptions)`

#### Request Schema
```json
{
  "videoUrl": "s3://<APPROVED_DEV_PROCESSED_BUCKET>/<APPROVED_DEV_OUTPUT_PREFIX>/reframed-output.mp4",
  "demoId": "cly...",
  "language": "en",
  "sync": false
}
```
- `videoUrl`: URL to process (passes `isSafeUrl`).
- `demoId`: Optional demo association.
- `language`: Subtitle language code (e.g. `"en"`, `"multi"`).
- `sync`: Boolean (defaults to `false`).

#### Output Artifacts
- Persists cues array to `VideoJob.jobData.subtitles`.
- Generates standard Advanced SubStation Alpha (`.ass`) file at `public/captions/<jobId>.ass`.
- Polling `GET /api/jobs/<jobId>` returns `{ state: "completed", subtitles: [...] }`.

---

### 2.3 Stage 3: AVS Dubbing Alignment (`POST /api/avs/dub`)

- **Code References:**
  - Route: `app/api/avs/dub/route.ts:1-329`
  - Queue: BullMQ queue instance `dubbingQueue` (underlying queue name `"dubbing-processing"` in `app/lib/queue.ts:44`)
  - Worker Invocation: `invokeGcpDubSync` (`app/lib/gcpWorker.ts`)
  - Client Builder: `app/lib/dubbing/request.ts:1-70`
  - Fallback Contract: `app/types/jobs/fallback.ts:1-30`

#### Authentication & Authorization
- Requires active NextAuth session (`getServerSession(authOptions)`).
- Plan Gating: User must have `plan === "PRO"` or `plan === "ENTERPRISE"`. Users on `"FREE"` plans receive `HTTP 403 { error: "Dubbing is available on PRO and ENTERPRISE plans" }`.
- Feature Flag: `isAvsEnabled()` must return `true` (otherwise `HTTP 404`).

#### Request Schema
```json
{
  "videoUrl": "s3://<APPROVED_DEV_PROCESSED_BUCKET>/<APPROVED_DEV_OUTPUT_PREFIX>/reframed-output.mp4",
  "dubUrl": "https://storage.googleapis.com/.../dubbed_audio.mp3",
  "steps": [
    { "id": "step-1", "index": 0, "startTime": 0.0, "endTime": 8.04 }
  ],
  "dubTimings": [
    { "stepId": "step-1", "start": 0.0, "end": 8.04 }
  ],
  "sourceDuration": 8.04,
  "duration": 8.04
}
```

#### The `MISSING_DUB_INPUT` Fallback Contract

> [!WARNING]
> **Graceful Fallback Does Not Equal Successful Dubbing:**
> The dubbing service implements Task-00083 graceful degradation. If any required dubbing parameters are missing:
> ```typescript
> const canAlign = Boolean(input.dubUrl) && input.steps.length > 0 && input.dubTimings.length > 0;
> ```
> When `canAlign === false`:
> 1. The service does **not** call `invokeGcpDubSync`.
> 2. The job is marked `status = "COMPLETED"`, `progress = 100`.
> 3. `exportedUrl` is set to the **unaligned source video URL**.
> 4. `jobData` is populated with fallback metadata:
>    ```json
>    {
>      "kind": "AVS_DUB",
>      "alignedVideoUrl": "<source_video_url>",
>      "duration": 8.04,
>      "fallback": true,
>      "fallbackStage": "DUBBING",
>      "fallbackReason": "MISSING_DUB_INPUT"
>    }
>    ```
> An automated test or audit runner must inspect `jobData.fallback` or the response `fallback` flag. A response with `fallback: true` must be marked as **degraded fallback**, never as successful dubbing alignment.

---

### 2.4 Job Polling Contract (`GET /api/jobs/:id`)

- **Code Reference:** `app/api/jobs/[id]/route.ts:43-169`
- **Authentication:** Requires NextAuth session. Job's `userId` must match `session.user.id` (returns HTTP 403 otherwise).

#### Response Envelope Shape

The response structure varies depending on job status and stage kind (`REFRAME`, `SUBTITLES`, `AVS_SYNC`, or `AVS_DUB`):

```typescript
{
  success: boolean;
  id: string;
  state: "waiting" | "active" | "completed" | "failed" | "cancelled" | "unknown";
  status: string; // Alias of state
  progress: number;
  exportedUrl: string | null;  // Set for final exports, reframe completions, and dubbing fallbacks
  captionUrl: string | null;
  score: object | null;
  error: string | null;
  subtitles: Array<object> | null; // Populated when jobData.kind === "SUBTITLES"
  jobData: Record<string, unknown> | null;

  // Conditionally present based on job kind and worker metadata:
  aligned?: {
    alignedVideoUrl: string | null; // Populated when jobData.kind === "AVS_SYNC" | "AVS_DUB"
    duration: number | null;
  };
  cropTargets?: CropTargetData | null; // Populated when jobData.kind === "REFRAME"
  fallback?: boolean;                  // True if graceful degradation triggered
  fallbackStage?: string;              // e.g. "DUBBING"
  fallbackReason?: string;             // e.g. "MISSING_DUB_INPUT"
  attemptsMade?: number;
}
```

> [!IMPORTANT]
> **AVS Aligned URL Location:** For dubbing jobs, `alignedVideoUrl` is returned nested inside the `aligned` object (`response.aligned.alignedVideoUrl`) as well as in `jobData.alignedVideoUrl`. When fallback occurs, `exportedUrl` also holds the fallback video URL. Operators and pollers should check `response.aligned?.alignedVideoUrl ?? response.exportedUrl`.

---

## 3. Storage Topology & Environment Resolution

### Configuration Status

The repository contains historical storage bucket names and environment configuration references. Their presence in source files or scripts does not establish that they are approved or available for Task 115 staging.

| Purpose | Configuration | Task 115 status |
|---|---|---|
| Input video storage | `RAW_BUCKET` | Approved Dev bucket and prefix pending confirmation |
| Processed video storage | `PROCESSED_BUCKET` | Approved Dev bucket and prefix pending confirmation |
| GPU worker | Environment-specific configuration | Approved Dev worker and region pending confirmation |

### Staging Resource Placeholders

- AWS region: `<APPROVED_DEV_REGION>`
- GPU worker instance: `<APPROVED_DEV_GPU_INSTANCE_ID>`
- Input location: `s3://<APPROVED_DEV_RAW_BUCKET>/<APPROVED_DEV_INPUT_PREFIX>/`
- Output location: `s3://<APPROVED_DEV_PROCESSED_BUCKET>/<APPROVED_DEV_OUTPUT_PREFIX>/`

These placeholders must not be used as literal commands or resource identifiers.

**Safety requirement:** Obtain written confirmation from Sarthak for the approved Dev worker, region, separate input/output prefixes, and access instructions before uploading videos or starting cloud jobs. Verify Dev database, Redis, storage, backend and gateway-token isolation from production before dispatch.

Historical resource names may be retained in historical records, but must not be described as approved Task 115 staging resources without confirmation.
---

## 4. Manual Sequencing Runbook for Staging Operators

To execute an integrated flow across the 3 selected test videos without code-level chaining:

### Step 1: Pre-Flight Health Probe (Read-Only)
```bash
# Query ML Gateway health on EC2
curl -s http://<EC2_INTERNAL_HOST>:8000/health | jq .
# Expected: {"status": "ok", "autoflip_ok": true, "talknet_ok": true}
```

### Step 2: Ingest Video to S3

**Status: BLOCKED — awaiting staging approval.**

Do not upload videos yet. First obtain Sarthak's confirmation of the approved Dev input/output prefixes and worker access. Perform the required preflight checks and use only the approved Dev storage locations. Never upload test videos to production or unconfirmed buckets.

### Step 3: Trigger Reframe
```bash
POST /api/reframe
Cookie: __Secure-next-auth.session-token=<SESSION_TOKEN>
Content-Type: application/json

{
  "videoUrl": "s3://<APPROVED_DEV_RAW_BUCKET>/<APPROVED_DEV_INPUT_PREFIX>/sample.mp4",
  "targetAspectRatio": "9:16"
}
```
*Poll `GET /api/jobs/<jobId>` until `status == "COMPLETED"`. Extract `exportedUrl`.*

### Step 4: Trigger Subtitles
```bash
POST /api/subtitles/create
Authorization: Bearer <CALLBACK_SECRET>
Content-Type: application/json

{
  "videoUrl": "<exportedUrl_from_step_3>",
  "language": "en"
}
```
*Poll `GET /api/jobs/<jobId>` until `status == "COMPLETED"`. Verify `.ass` subtitle artifact.*

### Step 5: Trigger Dubbing (Requires Dubbed Audio Asset)
```bash
POST /api/avs/dub
Cookie: __Secure-next-auth.session-token=<SESSION_TOKEN>
Content-Type: application/json

{
  "videoUrl": "<exportedUrl_from_step_3>",
  "dubUrl": "<uploaded_audio_url_mp3>",
  "steps": [{"id": "step-1", "startTime": 0.0, "endTime": 8.04}],
  "dubTimings": [{"stepId": "step-1", "start": 0.0, "end": 8.04}],
  "sourceDuration": 8.04
}
```
*Poll `GET /api/jobs/<jobId>`. Verify `jobData.fallback !== true`.*

---

## 5. Integration Validation Matrix

The following matrix records the verified state of the integrated pipeline:

| Component / Subsystem | Local Contracts & CI Tests | Staging Integration (Task 115) | Real Video Output Quality | Cloud GPU Performance & Latency |
| :--- | :--- | :--- | :--- | :--- |
| **Reframe (AutoFlip 16:9 → 9:16)** | **VERIFIED** (Unit/Route tests pass) | **PENDING** (Blocked on Staging Access) | **NOT YET VERIFIED** | **NOT YET VERIFIED** |
| **Reframe (TalkNet ASD Multi-Speaker)** | **VERIFIED** (Fusion logic & test pass) | **PENDING** (Blocked on Staging Access) | **NOT YET VERIFIED** | **NOT YET VERIFIED** |
| **Subtitle Generation (`.ass`)** | **VERIFIED** (Secret handling & tests pass) | **PENDING** (Blocked on Cloud Run Access) | **NOT YET VERIFIED** | **NOT YET VERIFIED** |
| **Dubbing Service & Fallback** | **VERIFIED** (Task-00083 tests pass) | **PENDING** (Blocked on Staging Access) | **NOT YET VERIFIED** | **NOT YET VERIFIED** |
| **Idempotency & Retry Safety** | **VERIFIED** (Task-00113 tests pass) | **PENDING** (Blocked on Staging Access) | **NOT YET VERIFIED** | **NOT YET VERIFIED** |
| **Failure Injection Handling** | **VERIFIED** (Task-00114 tests pass) | **PENDING** (Blocked on Staging Access) | **NOT YET VERIFIED** | **NOT YET VERIFIED** |

### Local Test Evidence
Execution of targeted test suites on `2026-11-18` (via `npx vitest run` and `pytest`):

| Test Suite File | Discovered Tests | Passed Tests | Execution Duration | Status / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `tests/failure-injection.test.ts` | 5 | 5 | ~87ms | ✅ PASS |
| `app/lib/safeUrl.test.ts` | 9 | 9 | ~23ms | ✅ PASS |
| `app/lib/avs/task71Flow.test.ts` | 1 | 1 | ~133ms | ✅ PASS |
| `app/api/jobs/create/dispatch-retry.test.ts` | 7 | 7 | ~4133ms | ✅ PASS |
| `app/api/avs/dub/route.test.ts` | 15 | 15 | ~116ms | ✅ PASS (Previously miscounted as 10) |
| `app/api/reframe/route.test.ts` | 7 | 7 | ~57ms | ✅ PASS (Previously miscounted as 9) |
| `app/api/subtitles/create/route.test.ts` | 9 | 9 | ~89ms | ✅ PASS (Previously miscounted as 12) |
| **Vitest Total (7 suites above)** | **53** | **53** | **~5.86s** | **100% PASS** |
| `reframe-worker/client.test.ts` | 6 | 6 | ~17ms | ✅ PASS (Worker gateway token test) |
| `ml-gateway/test_gateway.py` | 40 | 40 | ~10.31s | ✅ PASS (Python gateway auth & routing) |

- **Type Checking:** `npx tsc --noEmit` exited `0` (clean compilation, 0 errors).

### Cloud Staging Status

**PENDING — no staging sign-off yet.**

Before Task 115 execution, obtain and verify:

1. Sarthak's confirmation of the approved Dev GPU worker, region, and access instructions.
2. Approved, separate Dev input and output storage prefixes.
3. Dev database, Redis, storage, backend and gateway-token isolation from production.
4. Callback authentication preflight: unauthenticated callback requests must return HTTP 401.
5. Approved test window, resource-cost limits, and cleanup instructions.

Only after these prerequisites pass may the approved staging tests proceed. Record actual job IDs, stage statuses, timings, outputs, fallback results, callback-auth evidence, and GPU usage. Do not claim integration validation until supported by successful staging evidence.
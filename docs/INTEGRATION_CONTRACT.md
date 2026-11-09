# Real Auto-Reframe Integration Contract (Task-00035)

> **Status:** Production-verified contract reflecting the concrete implementation across browser, backend, BullMQ, reframe-worker, ML Gateway, AutoFlip, FFmpeg, and Cloudinary.

---

## A. SOURCE CONTRACT

### 1. Browser Video Ingestion
- When a user uploads a video file in the Marvedge editor (`app/components/editorSidebar/ToolsPanel.tsx`), the client directly performs an unsigned upload to **Cloudinary** using `uploadBlobToCloudinary` (`app/lib/cloudinaryClientUpload.ts`).
- **Cloudinary Endpoint:** `https://api.cloudinary.com/v1_1/<NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME>/video/upload`
- **Upload Parameters (FormData):**
  - `file`: Video `Blob`
  - `upload_preset`: `process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` (unsigned preset)
  - `folder`: `"reframe_sources"`
- **Output:** The client receives an HTTPS public URL (`secure_url`), e.g.:
  `https://res.cloudinary.com/<cloud_name>/video/upload/v12345/reframe_sources/<filename>.mp4`

### 2. URL Format Expectations
- The URL must be a publicly accessible HTTP/HTTPS URL and satisfy `isSafeUrl(videoUrl)`.
- Both the ML Gateway (`ml-gateway`) and the video renderer (`reframe-worker/render.ts`) download the source video directly over HTTP(S) streams using standard streaming GET requests.

---

## B. JOB CONTRACT

### 1. Request Endpoint: `POST /api/reframe`
Initiates a background reframing job.

- **Authentication:** Requires an active NextAuth session (`getServerSession(authOptions)`). Unauthenticated requests receive `HTTP 401 { error: "Unauthorized" }`.
- **Request Body (JSON):**
  ```json
  {
    "videoUrl": "https://res.cloudinary.com/.../reframe_sources/source.mp4",
    "targetAspectRatio": "9:16",
    "demoId": "optional-demo-id",
    "source": {
      "width": 1920,
      "height": 1080,
      "fps": 30.0,
      "durationSec": 15.2
    }
  }
  ```

### 2. Validation & Pre-conditions
- `videoUrl`: Required non-empty string with valid HTTP/HTTPS protocol, validated by `isSafeUrl()`.
- `targetAspectRatio`: Must be one of the supported target ratios: `"9:16"`, `"1:1"`, `"4:5"`, `"16:9"`. Defaults to `"9:16"`.
- `demoId`: Optional. If provided, ownership is verified (`demo.userId === session.user.id`). Mismatched or missing demos return `HTTP 404 { error: "Demo not found" }`.
- `source`: Optional source metadata dimensions (`width`, `height`, `fps`, `durationSec`).

### 3. Response Contracts
- **Success (`HTTP 200`):**
  ```json
  {
    "success": true,
    "jobId": "cmu...",
    "status": "pending"
  }
  ```
- **Client Error (`HTTP 400`):** `{ "error": "Invalid JSON body" | "Invalid video URL" | <validation detail> }`
- **Unauthorized (`HTTP 401`):** `{ "error": "Unauthorized" }`
- **Not Found (`HTTP 404`):** `{ "error": "User not found" | "Demo not found" }`
- **Server Error (`HTTP 500`):** `{ "error": "<error message>" }`

### 4. Database Lifecycle: `VideoJob`
A new tracking record is created in PostgreSQL via Prisma:
- `userId`: Authenticated user ID (`session.user.id`)
- `demoId`: Associated demo ID or `null`
- `videoUrl`: Source video URL
- `status`: `"PENDING"`
- `progress`: `0`
- `jobData`: `{ kind: "REFRAME", targetAspectRatio, ...(source ? { source } : {}) }`

### 5. BullMQ Queue Dispatch
- **Queue Name:** `reframe-processing`
- **Job Name:** `"reframe"`
- **Job ID:** Pinned to `jobRecord.id` (`{ jobId: jobRecord.id }`)
- **Job Payload (`ReframeJobPayload`):**
  ```typescript
  export interface ReframeJobPayload {
    jobId: string;
    videoUrl: string;
    targetAspectRatio: string;
    userId?: string;
    demoId?: string | null;
    source?: {
      width: number;
      height: number;
      fps?: number;
      durationSec?: number;
    } | null;
  }
  ```
- **Job Options:**
  - `attempts`: 3
  - `backoff`: Exponential (`{ type: "exponential", delay: 5000 }`)
  - `removeOnComplete`: 200
  - `removeOnFail`: 1000

---

## C. ML CONTRACT

### 1. Worker to ML Gateway Interaction
The `reframe-worker` invokes the internal ML Gateway:
- **Endpoint:** `POST ${REFRAME_ML_SERVICE_URL}/reframe` (default `http://localhost:8000/reframe`)
- **Headers:** `Content-Type: application/json`
- **Timeout:** Configurable via `REFRAME_ML_TIMEOUT_MS` (default `180000` ms / 3 minutes).

### 2. Request Envelope
```json
{
  "videoUrl": "https://res.cloudinary.com/.../source.mp4",
  "targetAspectRatio": "9:16",
  "source": {
    "width": 1920,
    "height": 1080,
    "fps": 30.0,
    "durationSec": 15.2
  }
}
```

### 3. Response Envelope & Parsing
The worker client (`reframe-worker/client.ts`) supports three valid envelope variants:
1. **Canonical Envelope:**
   ```json
   {
     "ok": true,
     "crop_targets": { /* CropTargetData */ }
   }
   ```
2. **Root Schema Envelope (Task-00016):**
   ```json
   {
     "schema_version": 1,
     "source": { ... },
     "output": { ... },
     "crop_targets": [ ... ]
   }
   ```
3. **CamelCase Envelope:**
   ```json
   {
     "cropTargets": { /* CropTargetData */ }
   }
   ```

### 4. `CropTargetData` Schema (`app/types/editor/crop-target.ts`)
```typescript
export interface CropTargetData {
  schema_version: 1;
  video_id?: string;
  source: {
    width: number;
    height: number;
    fps?: number;
    duration_sec?: number;
  };
  output: {
    aspect_ratio: string;
    width?: number;
    height?: number;
  };
  timeline?: {
    timebase?: "seconds";
    sampling?: "keyframes_interpolated" | "per_frame";
  };
  crop_targets: Array<{
    timestamp_sec: number;
    frame?: number;
    crop: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    confidence?: number;
    source?: string;
  }>;
}
```

### 5. Failure & Retry Semantics
- **Intermediate Attempts ($1$ and $2$ of $3$):** If ML Gateway returns non-200 or times out, the error is re-thrown so BullMQ handles backoff retry. The backend is **not** notified.
- **Final Attempt ($3$ of $3$):** Worker sends a `FAILED` callback to `POST /api/jobs/callback` before throwing.
- **Result Caching:** Successful ML results are cached in-memory by `jobId`. If downstream rendering or callback delivery fails transiently, subsequent BullMQ retry attempts reuse the cached crop targets without repeating ML inference.

---

## D. RENDER CONTRACT

### 1. Execution Flow (`reframe-worker/render.ts`)
1. **Source Download:** Downloads remote `videoUrl` into an OS temporary directory (`os.tmpdir()/reframe-render-<timestamp>-*`).
2. **Trajectory Optimization (`simplifyCropTargets`):**
   - High-density or per-frame targets are simplified with a sub-pixel tolerance ($0.5\text{ px}$).
   - Redundant stationary and colinear points are reduced while strictly preserving all direction changes, pans, and boundary positions.
3. **Filtergraph Construction (`buildFfmpegCropFilter`):**
   - Coordinate expressions are built using balanced binary decision trees (`if(lt(t, t_mid), left, right)`), ensuring recursion depth is $O(\log_2 N)$ ($\le 10$ levels) rather than $O(N)$, preventing FFmpeg evaluator stack overflows.
   - Expressions for `x` and `y` are enclosed in single quotes:
     `crop=w:h:'x_expr':'y_expr':exact=1`
   - Clamping `min(max(expr, 0), iw - w)` guarantees coordinates remain within frame boundaries.
4. **Command Length Handling:**
   - If the filter string length $\le 8000$ characters, passed directly via `-filter:v`.
   - If $> 8000$ characters, written to a temporary file and passed via `-filter_script:v <path>` to prevent Windows `CreateProcess` 32KB command length limits.
5. **Encoding Standard:**
   - Video Codec: `libx264`, preset `fast`, CRF `23`, pixel format `yuv420p`.
   - Audio Codec: `aac`.
   - Faststart: `-movflags +faststart` (web-optimized progressive streaming).
6. **Output Upload & Cleanup:**
   - The rendered MP4 is uploaded to Cloudinary folder `reframed_exports`.
   - `defaultUploadToCloudinary` explicitly initializes `cloudinary.config` with `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
   - All temporary files and folders are unconditionally cleaned up in a `finally` block.

---

## E. CALLBACK CONTRACT

### 1. Endpoint & Authentication
- **Endpoint:** `POST /api/jobs/callback`
- **Header:** `Authorization: Bearer <CALLBACK_SECRET>`
- Both Next.js and `reframe-worker` load `CALLBACK_SECRET` from `.env.local` or `.env`.

### 2. Payload Schemas (`app/types/jobs/callback.ts`)

#### Completed Reframe Job:
```json
{
  "jobId": "job-uuid",
  "status": "COMPLETED",
  "exportedUrl": "https://res.cloudinary.com/.../reframed_exports/output.mp4",
  "cropTargets": { /* Validated CropTargetData */ }
}
```

#### Failed Reframe Job:
```json
{
  "jobId": "job-uuid",
  "status": "FAILED",
  "error": "Error description"
}
```

#### Progress Update:
```json
{
  "jobId": "job-uuid",
  "status": "PROCESSING",
  "progress": 50
}
```

### 3. Response Contracts
- **Success:** `HTTP 200 { "success": true }`
- **Ignored (Terminal State):** `HTTP 200 { "success": true, "ignored": true, "message": "Job <id> is already in terminal state: <status>" }`
- **Unauthorized:** `HTTP 401 { "error": "Unauthorized" }`
- **Validation Error:** `HTTP 400 { "error": "<details>" }`

### 4. Idempotency & Terminal State Invariants
- Once a `VideoJob` reaches `COMPLETED` or `CANCELLED`, all subsequent callbacks are safely ignored (no status regression or double-processing).
- The worker does NOT retry 4xx responses (such as 400 validation error or 401 unauthorized), treating them as authoritative rejections.

---

## F. COMPLETION CONTRACT

### 1. Persistence
When `POST /api/jobs/callback` receives `COMPLETED`:
- Updates `VideoJob`:
  - `status`: `"COMPLETED"`
  - `progress`: `100`
  - `exportedUrl`: URL of the reframed MP4 in Cloudinary.
  - `jobData`: Merges existing jobData with `{ kind: "REFRAME", cropTargets }`.
  - `error`: `null`.
- Updates `Demo`:
  - If `job.demoId` is present and `exportedUrl` is set, updates `Demo.exportedUrl = exportedUrl`.

### 2. Frontend Discovery & Polling
- **Polling Function:** `pollExportJob` in `app/(signed)/editor/utils/videoHandlers.ts`.
- **Polling Endpoint:** `GET /api/jobs/${jobId}` (handled by `app/api/jobs/[id]/route.ts`).
- **Authentication:** Requires an active NextAuth session; returns `HTTP 401` if unauthenticated and `HTTP 403` if the job belongs to another user.
- **Polling Response Schema:**
  ```json
  {
    "success": true,
    "state": "waiting" | "active" | "completed" | "failed" | "cancelled",
    "progress": 100,
    "exportedUrl": "https://res.cloudinary.com/.../reframed_exports/output.mp4",
    "error": null,
    "subtitles": null,
    "cropTargets": { /* CropTargetData when kind is REFRAME */ }
  }
  ```
- **State Handling:**
  - While `state` is `"waiting"`, `"active"`, or `"delayed"`, updates UI progress and continues polling every 5,000 ms (up to 180 attempts / 15 minutes).
  - When `state === "completed"`, resolves `exportedUrl`.
  - When `state === "failed"`, throws the error message.
- **Client Completion Flow (`app/components/editorSidebar/ToolsPanel.tsx`):**
  - Sets `reframedJobId(jobId)` and `reframedUrl(outputUrl)`.
  - Opens `ExportResultModal` (`setShowResultModal(true)`).
  - Automatically triggers local download of the reframed MP4 using `createMp4Downloader`.

---

## G. ENVIRONMENT CONTRACT

| Variable Name | Purpose | Required By | Default / Fallback |
| :--- | :--- | :--- | :--- |
| `CALLBACK_SECRET` | Shared secret token for authenticating callbacks to `/api/jobs/callback` | Next.js API & Reframe Worker | None (Required) |
| `REDIS_URL` | Redis connection URL for BullMQ queue management | Next.js API & Reframe Worker | `redis://localhost:6379` |
| `BACKEND_URL` | Base URL of the Next.js backend for worker callbacks | Reframe Worker | `process.env.NEXT_PUBLIC_APP_URL` or `http://localhost:3000` |
| `REFRAME_ML_SERVICE_URL` | Base URL of the ML Gateway for AutoFlip inference | Reframe Worker | `http://localhost:8000` |
| `REFRAME_ML_TIMEOUT_MS` | Timeout for ML inference in milliseconds | Reframe Worker | `180000` (3 minutes) |
| `REFRAME_WORKER_CONCURRENCY` | Maximum concurrent BullMQ jobs processed by worker | Reframe Worker | `1` |
| `REFRAME_CALLBACK_MAX_RETRIES` | Maximum retry attempts for worker callback delivery | Reframe Worker | `3` |
| `REFRAME_CALLBACK_RETRY_DELAY_MS` | Delay between callback retry attempts in milliseconds | Reframe Worker | `1000` |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name for direct browser unsigned upload | Client | None (Required for browser upload) |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`| Unsigned Cloudinary upload preset for direct video uploads | Client | None (Required for browser upload) |
| `CLOUDINARY_CLOUD_NAME` | Server-side Cloudinary cloud name for worker export upload | Reframe Worker & Server | None (Required for render export) |
| `CLOUDINARY_API_KEY` | Server-side Cloudinary credentials for worker video upload | Reframe Worker & Server | None (Required for render export) |
| `CLOUDINARY_API_SECRET` | Server-side Cloudinary credentials for worker video upload | Reframe Worker & Server | None (Required for render export) |

# Task 111 — Architectural Evaluation: Local-Only E2E Feasibility

**Date:** 2026-11-24
**Workspace:** `C:\Users\kajal\OneDrive\Desktop\New folder\marvedge-task111`
**Branch:** `task/task-00111-e2e-local-validation`
**Evaluated Subject:** Feasibility of a genuine local-only end-to-end run without external credentials (Cloudinary/AWS) and without modifying production security or production code.
**Verdict:** **ARCHITECTURALLY NOT SUPPORTED (BLOCKED)**

---

## 1. Investigation Question
> Can a genuine local-only end-to-end run (Queue → Worker → Render → Callback → DB = COMPLETED) be completed using the existing architecture, using only the specified canary video on disk (`C:\Users\kajal\Downloads\WhatsApp Video 2026-11-18 at 1.41.14 PM.mp4`), without external credentials (Cloudinary/AWS) and without modifying production security or code?

---

## 2. Findings & Architectural Blockers

### Blocker 1: Input Ingestion Contract (SSRF Protection)
* **Authoritative Documentation:** `docs/INTEGRATION_CONTRACT.md` Section A ("Source Contract").
* **Implementation:** `app/lib/safeUrl.ts` (`isSafeUrl`), `app/lib/reframe/validation.ts` (`validateReframeJobPayload`), and `reframe-worker/render.ts` (`assertSafeDownloadUrl`).
* **Mechanism:**
  - `isSafeUrl` permits only `http:`, `https:`, `s3:`, `gs:`, `r2:`.
  - It explicitly rejects local paths, `file://` URIs, `localhost`, `127.0.0.1`, and all private RFC1918 IP addresses.
  - `assertSafeDownloadUrl` actively performs DNS resolution (`dns.promises.lookup`) and blocks private/loopback IPs.
* **Impact on Canary Video:**
  - The local canary video path `C:\Users\kajal\Downloads\WhatsApp Video 2026-11-18 at 1.41.14 PM.mp4` is rejected at the worker entrance with:
    `Invalid queued reframe payload: videoUrl is unsafe or invalid: C:\Users\kajal\Downloads\...`
  - Hosting via a local HTTP server (`http://localhost:3000/...` or `http://127.0.0.1/...`) is likewise blocked by SSRF defense.
* **Conclusion:** The architecture strictly requires input media to be hosted on public HTTP(S) infrastructure (designed for Cloudinary `reframe_sources` uploads).

### Blocker 2: Output Export Contract (Hard Dependency on Cloudinary)
* **Authoritative Documentation:** `docs/INTEGRATION_CONTRACT.md` Section D ("Render Contract") and Section E ("Callback Contract").
* **Implementation:** `reframe-worker/render.ts` (`defaultUploadToCloudinary`).
* **Mechanism:**
  ```typescript
  async function defaultUploadToCloudinary(filePath: string, options?: { publicId?: string }) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const result = await cloudinary.uploader.upload(filePath, uploadOptions);
    return { secure_url: result.secure_url };
  }
  ```
* **Impact on Local Execution:**
  - There is no local filesystem storage adapter, loopback fallback, or mock storage driver in `reframe-worker/render.ts`.
  - When `CLOUDINARY_API_KEY` and `CLOUDINARY_CLOUD_NAME` are empty strings, Cloudinary throws immediately.
  - The worker catches this rendering error, logs a fatal failure, and dispatches an authenticated `FAILED` callback to `POST /api/jobs/callback`.
* **Conclusion:** The existing worker cannot produce a valid `exportedUrl` without real Cloudinary credentials.

### Blocker 3: Worker Entry Point Lacks Storage Dependency Injection
* **Implementation:** `reframe-worker/index.ts` lines 70–95.
* **Mechanism:**
  - While `reframe-worker/orchestrator.ts` and `render.ts` expose dependency-injection interfaces for unit tests (`deps.renderVideo`, `deps.uploadToCloudinary`), the **production worker process** (`reframe-worker/index.ts`) only wires `deps.executeMl` (for `testFaultMode: "autoflip_empty"`).
  - The production worker does not expose CLI flags, environment variables, or job payload hooks to inject an alternate storage provider.
* **Conclusion:** The live worker running against BullMQ will always execute `defaultUploadToCloudinary`.

---

## 3. Summary Assessment

| Dimension | Supported Locally? | Evidence |
|---|---|---|
| PostgreSQL DB & Migrations | **YES** | Container `marvedge-task112-postgres` port 5432, 29 migrations applied |
| Redis Queue (BullMQ) | **YES** | Memurai on 127.0.0.1:6379 accepts and manages jobs |
| Callback Authentication | **YES** | `POST /api/jobs/callback` accepts `Bearer dev-secret` and rejects invalid tokens |
| Local FFmpeg Execution | **YES** | `ffmpeg-static` v6.1.1 operational |
| Local Video Ingestion (without cloud storage) | **NO** | Blocked by SSRF filter `isSafeUrl` |
| Local Video Export (without Cloudinary) | **NO** | Hardcoded `defaultUploadToCloudinary` in `reframe-worker/render.ts` |

**Final Recommendation:**
A true end-to-end run to `COMPLETED` cannot proceed without either:
1. Adding valid Cloudinary credentials to `.env.local` to enable the existing cloud storage path; OR
2. Modifying the production code to introduce a dedicated local storage driver and corresponding local URL whitelist for non-production environments.

In accordance with user instructions to preserve all code and security checks and avoid faking outputs, execution is stopped here.

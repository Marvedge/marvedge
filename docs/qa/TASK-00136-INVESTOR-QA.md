# Task-00136 — Investor Questions & Defensible Evidence-Backed Answers (Cost, Moat, Consent & Reliability)

- **Document:** `docs/qa/TASK-00136-INVESTOR-QA.md`
- **Task:** Task-00136 — Investor Demo Rehearsal & Evidence Audit
- **Date:** 2026-11-24
- **Active Branch:** `task/task-00135-investor-demo`
- **Base Commit:** `f227e8c88c972471ada7ec33fbef093b4ab0cbbb` (`feat(demo): add offline investor demo package`)
- **Investor Demo Rehearsal Status:** **`PASS — User-Confirmed Manual Rehearsal on 2026-11-24`** (`8/8` browser playback modes, external VLC backup `PASS`, and `~2-minute` timed presenter rehearsal `PASS`; 16s Marvedge product voiceover recording remains `PENDING`)
- **Governance Rule:** Every answer strictly separates measured observations from modeled projections, and explicitly discloses unimplemented policies and active infrastructure blockers.

---

## 1. Cost & Unit Economics

### Q1.1: What does processing a video cost?

**Defensible Answer:**
We track **modeled incremental pipeline COGS** (marginal compute runtime plus direct third-party per-minute API charges) across four deployment profiles defined in `TASK-00129-COST-PER-MINUTE-AND-MARGIN-ANALYSIS.md`:

| Deployment Profile                                            | Compute Infrastructure & Hourly Rate                                    | Speech & Dubbing Providers                                                    | Modeled Incremental COGS per Media Minute | Modeled Incremental COGS per 10-Min Video | Break-Even Selling Price |
| :------------------------------------------------------------ | :---------------------------------------------------------------------- | :---------------------------------------------------------------------------- | ----------------------------------------: | ----------------------------------------: | -----------------------: |
| **Profile 1: Standard SaaS Production (Default)**             | AWS EC2 `g4dn.xlarge` On-Demand (`$0.7104/hr`, Sydney `ap-southeast-2`) | OpenAI Whisper (`$0.0060/min`) + ElevenLabs Dubbing (`$0.1500/min`)           |                       **`$0.1705 / min`** |                             **`$1.7047`** |          `$0.1705 / min` |
| **Profile 2: Cost-Optimized Cloud**                           | AWS EC2 `g4dn.xlarge` Spot (`$0.2200/hr` reference)                     | Groq Whisper Large V3 (`$0.00185/min`) + ElevenLabs (`$0.1500/min`)           |                       **`$0.1563 / min`** |                             **`$1.5633`** |          `$0.1563 / min` |
| **Profile 3: Full Self-Hosted AI (Modeled R&D)**              | AWS EC2 `g4dn.xlarge` Spot (`$0.2200/hr` reference)                     | Local Faster-Whisper (`~15x` RT modeled) + Local GPU TTS (`1.0x` RTF modeled) |                       **`$0.0084 / min`** |                             **`$0.0839`** |          `$0.0084 / min` |
| **Profile 4: Serverless GPU Container (Cross-Cloud Modeled)** | Modeled GCP Cloud Run T4 (`$0.3500/hr`, billed per `100 ms`)            | Groq Whisper Large V3 (`$0.00185/min`) + ElevenLabs (`$0.1500/min`)           |                       **`$0.1590 / min`** |                             **`$1.5898`** |          `$0.1590 / min` |

- **Reframe + Captions Only (Without Dubbing):** When a user runs 9:16 reframing (AutoFlip + TalkNet) and captioning (Groq Whisper) without multilingual dubbing, modeled incremental COGS is **`$0.0063/min` on AWS Spot** (`$0.0633` per 10-minute video) or **`$0.0163/min` on AWS On-Demand** (`$0.1633` per 10-minute video).
- **Mandatory Accounting Disclosure:** These figures are **modeled incremental per-job COGS**, **not** actual all-in production expenditure. They exclude idle instance capacity, cold-start boot time (`90–180s`), persistent `100 GB gp3` EBS storage (`$9.60/month`), public IPv4 charges, Redis/database hosting, failed job retries, and Cloudinary/S3/R2 storage and CDN egress.

---

### Q1.2: What are the main cost drivers?

**Defensible Answer:**

1. **External Dubbing API Fees (88.0% to 95.9% of Commercial SaaS COGS):** In Profiles 1, 2, and 4, ElevenLabs dubbing (`$0.1500/min`, or `$1.5000` per 10-minute video) accounts for **88.0%** (Profile 1) to **95.9%** (Profile 2) of total incremental cost (`TASK-00129` §4).
2. **Active Speaker GPU Compute (TalkNet):** In Profile 1, TalkNet CUDA inference (`1.216x` RTF = `729.6s` compute per 10-minute video) costs `$0.1440` per 10-minute video on On-Demand (`8.45%` of Profile 1 COGS) or `$0.0446` on Spot (`2.85%` of Profile 2 COGS; `53.13%` of Profile 3 self-hosted COGS).
3. **Speech Transcription (Captions):** OpenAI Whisper costs `$0.0600` per 10-minute video (`3.52%` of Profile 1), while Groq Whisper Large V3 costs `$0.0185` per 10-minute video (`1.18%` of Profile 2) — a **69.2% reduction**.
4. **AutoFlip C++ Reframing:** Negligible (`$0.0002` to `$0.0008` per 10-minute video, `<0.3%` of COGS across all profiles).

---

### Q1.3: Which costs are measured versus estimated?

**Defensible Answer:**
We maintain a strict boundary between physical telemetry captured during controlled benchmarks and modeled projections (`TASK-00128-LIVE-AWS-GPU-BENCHMARK.md`, `TASK-00129-COST-PER-MINUTE-AND-MARGIN-ANALYSIS.md` §7, and `docs/VOICESTUDIO_INTEGRATION.md` §12):

- **Empirically Measured Observations:**
  1. **AWS EC2 `g4dn.xlarge` Live Session Spend (`Task-00128`, `2026-11-11`):** Instance `i-02aa4578f3790bae1` ran for `22.35 minutes` (`1,341s`) at the audited Sydney On-Demand rate of `$0.7104/hr`, incurring **`$0.2646 USD` actual incremental compute spend** (`~$0.27 USD` including `$0.0019` public IPv4).
  2. **TalkNet Physical CUDA Telemetry (`Task-00128`):** Measured on an `8.04s` clip (`1.mp4`) on Tesla T4: `9.778s` wall-clock duration (**`1.216x` RTF**), `54%` peak GPU compute, `19.2%` average GPU compute, and `435 MiB` peak VRAM across `77` `nvidia-smi` samples (`benchmark_results/talknet_gpu_benchmark.json`).
  3. **AutoFlip Native CPU Execution (`Task-00128` & `Task-00135`):** Measured `0.052s` on `192` frames (`8.0s` clip = **`0.0065x` RTF** / `153.8x` real-time, `0%` GPU load) on EC2 `g4dn.xlarge`, and `~12.5s` on a `539`-frame (`18.018s`) 720p human presenter clip locally with every-frame (`period: 1`) face detection.
  4. **Groq Whisper Large V3 API (`Task-00128` Phase 1, `N=1`):** Transcribed a `30.06s` audio clip in `1.296s` (`23.2x` real-time API response latency) at the published rate of `$0.111/hr` (`$0.00185/min`, `benchmark_results/task128_real_providers_attempt_report.json`).
  5. **Isolated VoiceStudio OmniVoice GPU Synthesis (`Task-00103`, `2026-11-08`):** Synthesized `999.32s` (`16m 39.3s`) of 24 kHz WAV speech across 10 batches in `380.305s` of Tesla T4 GPU compute (**`0.3806x` RTF**, `9,837 MiB` peak VRAM), corresponding to `$0.00451/min` (`$0.0451` per 10 minutes) of pure marginal TTS compute (`docs/VOICESTUDIO_INTEGRATION.md` §12).
- **Modeled / Estimated Figures (Not Measured End-to-End in Production):**
  1. **10-Minute Self-Hosted Profile 3 (`$0.0084/min` / `$0.0839` per 10 min):** Uses an illustrative `1.0x` RTF assumption (`600s` compute per 10 min) for full self-hosted dubbing plus an unexecuted published estimate (`0.0667x` RTF / `~15x` RT) for local Faster-Whisper CUDA transcription.
  2. **Serverless GCP Cloud Run T4 Profile 4 (`$0.1590/min`):** Applies published GCP Cloud Run T4 pricing (`$0.35/hr`) to stage runtimes measured on AWS EC2 `g4dn.xlarge`; no live GCP Cloud Run GPU container was deployed or benchmarked.
  3. **3× GPU Concurrency Cost Allocation (`TASK-00129` §6.2):** Theoretical accounting division based on TalkNet's `435 MiB` VRAM footprint out of `15,360 MiB`; actual multi-job CUDA contention with simultaneous VoiceStudio (`9,837 MiB` VRAM) is untested in production, where worker concurrency is locked to `1`.

---

### Q1.4: How does hardware choice affect unit economics?

**Defensible Answer:**

1. **AWS On-Demand (`$0.7104/hr`) vs. AWS Spot (`$0.2200/hr`):** Spot instances reduce per-job GPU compute cost by **69%** (dropping 10-minute TalkNet + AutoFlip compute from `$0.1447` to `$0.0448`). However, when using ElevenLabs (`$1.50/10 min`), Spot reduces total 10-minute job COGS by only **8.3%** (`$1.7047` $\to$ `$1.5633`) because third-party API fees dominate. Spot compute savings become transformative only when paired with self-hosted TTS (`$0.0839/10 min`).
2. **Persistent EC2 vs. Stopped / Serverless GPU:** An On-Demand `g4dn.xlarge` running 24×7 costs **`~$511/month`** whether jobs are running or not. Keeping the EC2 worker stopped when idle eliminates hourly compute charges (`$0.00/hr`), leaving only the fixed **`$9.60/month`** (`100 GB gp3` EBS root volume at `$0.096/GB-mo`) persistent storage overhead (`TASK-00129` §6.1).

---

### Q1.5: What assumptions would change the estimate?

**Defensible Answer:**

1. **Idle Instance Utilization & Cold Starts:** If the EC2 GPU worker stays running between sparse jobs, unallocated idle hours and the `90–180s` cold-boot/model-load window (`docs/V3_AI_ARCHITECTURE_AND_OPERATIONS.md` §8.5) increase actual cloud spend well above marginal runtime COGS.
2. **Fixed EBS Storage Amortization:** At `1,000` processed minutes/month, the `$9.60/month` EBS volume adds `+$0.0096/min`; at `50,000` minutes/month, it amortizes to `+$0.00019/min` (`TASK-00129` §6.1).
3. **Multi-Speaker Density:** TalkNet's `1.216x` RTF was measured on an `8.04s` clip with 0 faces; videos with multiple simultaneous speakers increase S3FD face detection and LSTM scoring duration per media minute.
4. **Retries, Cancelled Jobs & CDN Egress:** Failed/retried ElevenLabs calls re-incur character billing (`$0.18–$0.24/1k chars`, `docs/V3_AI_ARCHITECTURE_AND_OPERATIONS.md` §6.9), and cancelling an in-flight Cloud Run subtitle job (`§8.6`) discards the output without refunding downstream compute/API execution.

---

## 2. Technical Moat & Product Differentiation

### Q2.1: What differentiates Marvedge from existing video editing tools?

**Defensible Answer:**
Most creator tools fall into one of two disconnected silos: (1) interactive product-demo / screen-recording tools that only output `16:9` desktop embeds, or (2) standalone social-clip wrappers that crop video without interactive overlays or CRM attribution.
Marvedge combines **four layers in one unified architecture** (`docs/V3_AI_ARCHITECTURE_AND_OPERATIONS.md` §1–§3, `prisma/schema.prisma`):

1. **Browser-Native Multi-Layer Timeline Editor:** Frame-accurate canvas editing, custom branding, subtitle track layout (`app/components/timeline-ruler/`), and audio clip trimming.
2. **Dual-Mode 16:9 $\to$ 9:16 Reframing Engine:** Combines MediaPipe AutoFlip dynamic subject/face cropping (`autoflip/`) with deterministic FFmpeg Blur-Pad Context Fit (`scripts/demoCaptionedCroppedClip.ts`) when full horizontal UI context must be preserved.
3. **Deterministic `.ASS` Kinetic Caption Engine:** Converts word-level timestamps into collision-free Advanced SubStation Alpha karaoke streams (`\k` tags, `0.8s` pause segmentation, LTR/RTL/bidi support) verified by **326 automated unit tests** (`app/lib/subtitles/`).
4. **Interactive Overlays & Encrypted CRM Lead Attribution:** Native in-video lead gates, branching overlays, and idempotent delivery ledgers (`VideoOverlayConfig`, `Lead`, `CrmConnection`, `LeadDelivery` in `prisma/schema.prisma` lines 374–500) with AES-256-GCM encrypted credentials (`app/lib/crm/crypto.ts`).

---

### Q2.2: What is technically difficult to replicate?

**Defensible Answer:**

1. **CPU/GPU Split Reframing & Active-Speaker Fusion (`ml-gateway/crop_fusion.py`):** Offloading keyframe face detection (`YuNet ONNX` / MediaPipe AutoFlip) to host CPU (`0–3 MiB` GPU VRAM) while reserving Tesla T4 VRAM (`~435 MiB`) for TalkNet audio-visual cross-attention, with automatic graceful degradation to AutoFlip or center-crop if speaker tracks are absent.
2. **Balanced Binary FFmpeg Filtergraph Compilation (`app/types/editor/crop-target.ts`):** Simplifying hundreds of per-frame AutoFlip crop targets via Ramer-Douglas-Peucker (`simplifyCropTargets`) and compiling them into bounded, balanced binary `if(lt(t,...))` expression trees (`buildFfmpegCropFilter`) that prevent FFmpeg parser stack overflows on long-form videos, paired with `-noautorotate` mobile rotation guards (`docs/GPU_COST_CONCURRENCY.md` §4.5).
3. **Fail-Closed Artifact Validation Guards (`video-worker/index.ts`):** Dual post-alignment and pre-completion checks (`Task-00132`, verified by `110` automated worker tests) that inspect callback status and output URLs to guarantee that raw audio WAVs, empty strings, or unmodified source MP4s can never be persisted as a `COMPLETED` dubbing job.
4. **Atomic Multi-Process Redis Monitoring (`app/lib/monitoring/`):** Atomic Lua state-transition scripts (`transitionLuaScript`) over 1-minute Redis telemetry buckets that guarantee zero false stuck-queue alarms when idle and zero duplicate alert storms across worker restarts (`91` unit tests).

---

### Q2.3: Which capabilities are implemented versus planned?

**Defensible Answer:**

| Lifecycle Category                                                         | Capabilities                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Evidence & Current Status                                                                                                                                         |
| :------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Implemented & Verified Locally / in Automated Tests**                    | • Browser timeline editor & subtitle track layout<br>• `.ASS` karaoke subtitle engine (`326` tests)<br>• AutoFlip C++ JSON runner (`run_autoflip_to_json`) & FFmpeg crop/blur-pad compiler<br>• BullMQ worker retry classification & dual dubbing validation guards (`110` tests, PR #578 open)<br>• Prometheus metrics exporter & Resend email alerting (`91` tests + `6/6` live emails received)<br>• Interactive video overlays, immutable lead consent capture & AES-256-GCM CRM encryption | Verified in repository source and Vitest suites (`2026-11-11` – `2026-11-23`). Note: `Task-00132` PR #578 (`aa249ef`) is open and awaiting merge to `master`.     |
| **Verified in Isolated Cloud/GPU Benchmarks (Opt-In / Currently Stopped)** | • TalkNet PyTorch CUDA active speaker detection on EC2 `g4dn.xlarge` (`1.216x` RTF, `435 MiB` VRAM)<br>• AutoFlip native execution on EC2 (`0.0065x` RTF on 192 frames)<br>• Groq Whisper Large V3 API transcription (`23.2x` RT)<br>• VoiceStudio `k2-fsa/OmniVoice` TTS on EC2 Tesla T4 (`0.3806x` RTF on `999.32s` speech)                                                                                                                                                                   | Verified on `i-02aa4578f3790bae1` (`Task-00103`, `Task-00128`). Instance is currently `stopped` (`Code 80`).                                                      |
| **Blocked / Requiring Remediation Before Production Release**              | • Live Vercel $\to$ Upstash Redis $\to$ EC2 Worker $\to$ `/api/jobs/callback` end-to-end completion<br>• Production deployment of dynamic single-speaker AutoFlip graph (`period: 1` face-only)<br>• Upstream C++ fix in `SceneCropper::ProcessKinematicPathSolver` for downsampled kinematic object tracking<br>• Commercial self-hosted dubbing (blocked by AGPL-3.0 / CC-BY-NC 4.0 licensing and perceptual lip-sync asset mismatch)                                                         | Documented in `docs/qa/TASK-00018-DEV-INTEGRATION-VALIDATION.md`, `TASK-00132-PHASE-8-COMPLETION-REPORT.md`, and `TASK-00135-INVESTOR-DEMO-AUDIT-AND-PLAN.md` §9. |
| **Planned / Deferred (V5 Roadmap)**                                        | • Replacing `OmniVoice` (CC-BY-NC 4.0) with commercially cleared Apache-2.0 open weights (e.g., `Kokoro-82M`)<br>• Multi-job GPU concurrency (`>1` simultaneous jobs per T4/L4 GPU)<br>• AWS Lambda serverless chunk splitter (`USE_AWS_SPLITTER="false"`)<br>• Automated S3/Cloudinary/R2 blob deletion on user account deletion<br>• Public developer SDK                                                                                                                                     | Documented in `docs/SCOPE_FREEZE_CTO_SIGNOFF.md` §1 & §7 and `docs/V3_AI_ARCHITECTURE_AND_OPERATIONS.md` §2.2 & §8.2.                                             |

---

### Q2.4: What could become a durable competitive advantage?

**Defensible Answer:**

1. **Closed-Loop Video Creation + Conversion Attribution:** Connecting automated short-form video adaptation directly to interactive lead capture (`Lead`) and encrypted CRM delivery (`CrmConnection` $\to$ HubSpot / Salesforce / Webhook) inside the same data model gives B2B and creator teams pipeline-attribution data that standalone video clippers cannot observe.
2. **Sovereign GPU Unit-Economics Arbitrage (`95%` Variable Cost Reduction):** Our provider-neutral `DubbingProviderAdapter` (`app/lib/voicestudio/dubbingAdapter.ts` vs. `app/lib/elevenlabs/dubbing.ts`) and `cloudCostBenchmark` harness allow Marvedge to launch immediately on commercial APIs (`$0.1563–$0.1705/min`) while migrating high-volume tiers to self-hosted GPU inference (`~$0.0084/min` modeled) once Apache-2.0 voice weights replace non-commercial checkpoints.

---

## 3. Consent, Data Handling, Licensing & Privacy

### Q3.1: What happens to uploaded video and audio?

**Defensible Answer:**

1. **Client Upload & URL Validation:** In the web app, the browser uploads source video directly to Cloudinary CDN (`secure_url`). When a job is submitted (`POST /api/reframe`, `/api/dubbing/create`, `/api/subtitles/create`), Next.js validates the URL via `isSafeUrl()` to block private subnets, localhost, and cloud metadata IPs (`169.254.169.254`), and `autoflip/service.py` (`_PeerValidationMixin`, lines 49–119) validates the connected socket peer IP at the TCP/TLS layer to prevent DNS-rebinding TOCTOU attacks.
2. **Ephemeral Worker Processing & Cleanup:** Workers stage downloaded media in isolated per-job temporary directories (`/tmp/reframe_<uuid>`) and unconditionally delete local scratch files in a `finally` block (`shutil.rmtree(temp_dir, ignore_errors=True)` in `autoflip/service.py` lines 631–634; verified for dubbing in `app/lib/avs/dubbingProcessor.cleanup.test.ts`).
3. **Output Storage:** Rendered deliverables are uploaded to Cloudinary (`reframed_exports/`) or AWS S3 (`marvedge-processed-ap2`, configured with Block All Public Access and AES-256 encryption per `docs/SCOPE_FREEZE_CTO_SIGNOFF.md` §5), and HLS segments are stored in Cloudflare R2 (`prisma/schema.prisma` lines 234–239).

---

### Q3.2: How are faces, voices, and personal data handled?

**Defensible Answer:**

- **Facial Data:** Processed exclusively in transient memory/scratch during job execution by MediaPipe AutoFlip (`FaceToRegionCalculator`) or TalkNet (S3FD + LSTM) to compute bounding-box crop coordinates (`CropTargetData` JSON: `{ x, y, width, height }`) and active-speaker time segments. **No facial recognition templates, biometric identity vectors, or face crops are stored in PostgreSQL.**
- **Voice & Audio Data:** Demuxed to temporary WAV files and transmitted to the configured STT provider (Deepgram Nova-2, Groq Whisper, or OpenAI Whisper) for transcription, and—only when dubbing is explicitly invoked by a `PRO`/`ENTERPRISE` user—to ElevenLabs (or opt-in local VoiceStudio).
- **Viewer Lead PII & User Secrets:** Viewer lead submissions (`name`, `email`, `companySize`) are stored in the `Lead` table in PostgreSQL (`prisma/schema.prisma` lines 386–405). User-configured CRM credentials (`CrmConnection.credentials`) are **never stored in plaintext**; `app/lib/crm/crypto.ts` encrypts them at rest using **AES-256-GCM** (`{ v, iv, tag, ct }`).

---

### Q3.3: What consent is required?

**Defensible Answer:**

- **Implemented in Code (Viewer Lead-Gate Consent):** When an end-viewer submits their contact details through an interactive video overlay lead gate, the exact consent text displayed on screen at the moment of submission (`consentText: String?`) and the UTC timestamp (`consentAt: DateTime?`) are stored immutably on that viewer's `Lead` row (`prisma/schema.prisma` lines 394–399) so future edits to overlay wording cannot retroactively alter what the viewer agreed to.
- **Unresolved / Not Yet Enforced in Code (Creator Upload & Speaker Biometric/Voice Consent):** The application does **not** currently implement an in-app consent attestation checkbox, voice-cloning authorization verification, or speaker release workflow before a user uploads video/audio containing third-party faces or voices.

---

### Q3.4: What are the retention and deletion policies?

**Defensible Answer:**

- **Worker Local Disk:** `0` retention post-job (deleted immediately in `finally` blocks).
- **Redis & BullMQ Queues (`app/lib/queue.ts`, `docs/V3_AI_ARCHITECTURE_AND_OPERATIONS.md` §3.2 & §7.6):** Completed BullMQ job metadata is capped at `100` (`reframe-processing`) to `200` (`dubbing/subtitle/audio`) jobs; failed job records are capped at `500` to `1000` jobs; Redis monitoring alert state keys expire automatically via a **7-day TTL (`604,800 seconds`)**.
- **PostgreSQL Account & Demo Deletion Cascade (`prisma/schema.prisma` lines 88–147, `app/api/user/delete/route.ts`):**
  - Invoking `DELETE /api/user/delete` removes any Cloudflare custom hostname (`deleteCustomDomain`), deletes `Session` and `Account` records, and deletes the `User` row.
  - PostgreSQL foreign-key `onDelete: Cascade` rules (enforced by automated schema parser tests in `app/lib/overlays/cascade.test.ts`) automatically destroy all owned `Demo`, `Tutorial`, `Slide`, `VideoJob`, `ExportedVideo`, `Review`, `Cta`, `CtaClick`, `HubSettings`, `SubtitleTrack`, `AudioClip`, `VideoOverlayConfig`, `Lead` (viewer PII), `PlayerEvent`, `CrmConnection` (encrypted secrets), and `LeadDelivery` records.
  - Only non-PII anonymous aggregate counters (`View` via `onDelete: SetNull` and `PlayerEventDaily` which holds daily integer counts with no PII) are retained.
- **Unresolved Gap — Cloud Object Storage Blobs:** Inspecting `app/api/user/delete/route.ts` (lines 1–53) confirms that account deletion **does not currently invoke Cloudinary, AWS S3, or Cloudflare R2 deletion APIs** to purge uploaded source videos (`videoUrl`), rendered MP4s (`exportedUrl`), or HLS segments (`hlsPlaylistUrl`), nor are bucket lifecycle expiration TTLs codified in the repository.

---

### Q3.5: Which privacy, consent, and licensing answers are documented/implemented versus still requiring policy confirmation?

**Defensible Answer:**

| Area                               | Implemented & Verified in Repository Code                                                                                                                                                                                                    | Unresolved / Requires Policy, Legal, or Engineering Action                                                                                                                                                                                                |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Account & PII Deletion**         | PostgreSQL `ON DELETE CASCADE` across `User` $\to$ `Demo`, `VideoJob`, `ExportedVideo`, `Lead`, `CrmConnection`, `LeadDelivery` (`prisma/schema.prisma`, `app/api/user/delete/route.ts`, `cascade.test.ts`).                                 | **Cloudinary, AWS S3, and Cloudflare R2 media blob purge** on account/demo deletion is not implemented in `app/api/user/delete/route.ts`.                                                                                                                 |
| **Viewer vs. Speaker Consent**     | Immutable per-lead `consentText` and `consentAt` stored on `Lead` rows (`prisma/schema.prisma` lines 394–399).                                                                                                                               | **Speaker / voice-cloning / biometric upload consent gate** and published **`/privacy` and `/terms` web routes** do not exist in `app/`.                                                                                                                  |
| **Data Retention TTLs**            | Ephemeral worker scratch deletion (`finally` blocks); BullMQ job count limits (`100–1000`); Redis alert state `7-day` TTL (`604,800s`).                                                                                                      | Formal retention schedules and S3/Cloudinary/R2 lifecycle rules for stored customer videos and third-party vendor retention (ElevenLabs, Deepgram, Groq).                                                                                                 |
| **Secret & Credential Protection** | AES-256-GCM encryption at rest for `CrmConnection.credentials` (`app/lib/crm/crypto.ts`); webhook URL secret masking (`docs/V3_AI_ARCHITECTURE_AND_OPERATIONS.md` §7.5); SSRF & DNS-rebinding socket guards (`autoflip/service.py`).         | Rotation of historical AWS IAM access key noted in `docs/SCOPE_FREEZE_CTO_SIGNOFF.md` §7 (`P1`).                                                                                                                                                          |
| **AI Model & Media Licensing**     | Task-00135 investor demo visuals use 100% Marvedge-owned 3D animations (`public/icons/1.mp4`, `2.mp4`); unlicensed Task-00070 BBC comedy clip and AVA academic dataset clips were retired (`TASK-00135-INVESTOR-DEMO-AUDIT-AND-PLAN.md` §4). | **VoiceStudio (`GNU AGPL-3.0`)** network-copyleft legal review and replacement of **`k2-fsa/OmniVoice` (`CC-BY-NC 4.0 Non-Commercial`)** with an Apache-2.0 model before any commercial self-hosted dubbing use (`docs/VOICESTUDIO_INTEGRATION.md` §1.B). |

---

## 4. Reliability, Monitoring & Failure Recovery

### Q4.1: What happens when individual pipeline stages fail?

**Defensible Answer:**
Each pipeline stage has an explicit, tested failure policy (`docs/V3_AI_ARCHITECTURE_AND_OPERATIONS.md` §3.2, §3.4, §3.7; `TASK-00132-PHASE-8-COMPLETION-REPORT.md` §2–§3):

1. **TalkNet Active Speaker Failure in Combined Reframe (`/reframe-combined`):** If TalkNet times out, crashes, or detects zero active speakers, `ml-gateway/crop_fusion.py` logs the condition and gracefully falls back to AutoFlip crop coordinates.
2. **AutoFlip Failure or Out-of-Bounds Crop (`reframe-processing`):** `validateCropTargetData()` (`app/types/editor/crop-target.ts`) validates schema version, monotonic timestamps, and frame bounds (`x + width <= source.width + 0.5`). On terminal failure after 3 BullMQ attempts, `reframe-worker` falls back deterministically to a geometric center crop so the job still produces a valid 9:16 video.
3. **VoiceStudio / Turnkey Dubbing Failure (`job.name === "dubbing"`):** **Fails closed.**
   - If VoiceStudio is unreachable or errors, it throws a typed `VOICESTUDIO_UNAVAILABLE` or `INFERENCE_FAILED` error.
   - Automatic fallback to paid ElevenLabs APIs is **disabled by default** (`VOICESTUDIO_FALLBACK_TO_PAID="false"`) to prevent runaway third-party API billing (`docs/VOICESTUDIO_INTEGRATION.md` §1.C).
   - Dual guards in `video-worker/index.ts` (`Task-00132`, verified by `22/22` tests in `video-worker/dubbingWorker.test.ts`) verify that `avsCallbackStatus === "COMPLETED"` and that the output URL is non-empty, not equal to the intermediate `audioUrl` (`.wav`), and not equal to the unmodified `sourceUrl` (`.mp4`). Any violation marks the `VideoJob` as `FAILED` in PostgreSQL.
4. **Legacy Generic AVS Dub Failure (`job.name === "avs-dub"`):** Strictly isolated from `job.name === "dubbing"`. After 2 failed attempts, `avs-dub` completes in explicit degraded mode returning the original source video flagged with `fallback: true` and `fallbackStage: "DUBBING"` (`video-worker/index.ts` lines 32–45).
5. **Subtitle or Audio Trim Failure (`subtitle-processing`, `audio-processing`):** Fails closed after 3 attempts and records a sanitized terminal `FAILED` status in `VideoJob`.

---

### Q4.2: How are retries and fallback paths handled?

**Defensible Answer:**

- **Queue-Level Exponential Backoff (`app/lib/queue.ts`):**
  - `reframe-processing`: Max **3 attempts**, exponential backoff (`2,000 ms` base).
  - `dubbing-processing`: Max **2 attempts**, exponential backoff (`5,000 ms` base).
  - `subtitle-processing`, `audio-processing`, `video-processing`: Max **3 attempts**, exponential backoff (`5,000 ms` base).
- **Error Classification (`video-worker/dubbingRetry.ts`, `12/12` passing unit tests):** `classifyDubbingError()` distinguishes transient errors (HTTP 408/429/502/503/504, `ECONNRESET`, `ETIMEDOUT`), which allow BullMQ to retry without prematurely writing `FAILED` to PostgreSQL, from permanent errors (HTTP 400/401/403/422, invalid output artifact, missing timestamps), which abort retries immediately (`UnrecoverableError`) to prevent duplicate vendor billing.
- **EC2 Runaway Spend Watchdogs (`docs/VOICESTUDIO_INTEGRATION.md` §6):** GPU benchmark scripts enforce a 3-layer teardown guarantee: (1) an independent Linux host-side `sudo shutdown -h +35` timer (with `InstanceInitiatedShutdownBehavior=stop`), (2) a local workstation PowerShell watchdog (`scripts/watchdog-ec2-session.ps1`), and (3) `trap cleanup_and_halt EXIT ERR INT TERM` failure handlers.

---

### Q4.3: What monitoring exists?

**Defensible Answer:**

1. **Prometheus OpenMetrics Exporter (`GET /api/monitoring/metrics`):**
   - Protected by constant-time `crypto.timingSafeEqual` comparison against `x-marvedge-rollup-secret` (`app/api/monitoring/metrics/route.ts`).
   - Exports `marvedge_jobs_total{pipeline, status}`, `marvedge_queue_depth{pipeline, state}` (`waiting`, `active`, `delayed`, `failed`), `marvedge_reframe_inference_duration_seconds_bucket`, and `marvedge_dubbing_duration_seconds_bucket` (`docs/qa/TASK-00131-FINAL-VERIFICATION.md`).
2. **Automated Alert Evaluator (`scripts/monitoringAlerts.ts` & `app/lib/monitoring/`):**
   - Backed by **91 passing Vitest tests** (`app/lib/monitoring/`).
   - Evaluates three operational conditions every 60 seconds using atomic Redis Lua state transitions:
     1. **Terminal Job Failure Rate (`reframe_job_failure_rate` / `dubbing_job_failure_rate`):** Fires when terminal failure rate exceeds **`20.0%`** over a rolling `300s` window with a minimum volume of **`10` jobs** (intermediate retries are excluded).
     2. **Stuck Queue Age (`reframe_stuck_queue` / `dubbing_stuck_queue`):** Fires when oldest active/waiting job exceeds **`300s`** (reframe) or **`600s`** (dubbing); evaluates to `0.0s` when queues are empty and excludes `delayed` backoff jobs.
     3. **Estimated GPU / Vendor Spend Threshold (`gpu_spend_threshold`):** Fires when estimated runtime/character spend breaches **`$25.00 USD`**, including a mandatory disclaimer that the figure is an operational estimate rather than a cloud billing invoice.
   - If Redis or metric scraping fails, pipeline rules are skipped rather than assumed healthy, and `monitoring_data_unavailable` fires immediately (`docs/V3_AI_ARCHITECTURE_AND_OPERATIONS.md` §7.8).
3. **Human-Verified Live Email Delivery (`Task-00130`, `2026-11-16`):**
   - All 6 firing and recovery notifications were transmitted live via Resend API v2 from verified sender `no-reply@mail.marvedge.com` to `contact@marvedge.com` (`HTTP 200`, Resend IDs `01a1e3e5-b95f...` through `01a1e3e5-bfb9...`) and confirmed received in the inbox by Rahul (`docs/qa/TASK-00130-LIVE-ALERTING-VERIFICATION.md`).

---

### Q4.4: What has been tested under load?

**Defensible Answer:**

- **Simulated In-Memory Concurrent Load (`scripts/benchmark/concurrentLoadRunner.ts`):** Tested queue drain, injected HTTP 504 gateway timeouts, BullMQ retry loops, and automatic center-crop fallback across concurrency levels `1`, `2`, and `4` using in-memory test doubles (`docs/V3_AI_ARCHITECTURE_AND_OPERATIONS.md` §5.3).
- **Historical Long-Form CPU/Keyframe Reframing Corpus (`docs/SCOPE_FREEZE_CTO_SIGNOFF.md` §4 & `docs/GPU_COST_CONCURRENCY.md` §3):** Tested keyframe-only (`-skip_frame nokey`) YuNet ONNX + FFmpeg reframing across 8 videos (`6.8+ hours` total media, including a `22m 19s` clip processed in `46.92s` on Colab T4 and a `2h 14m` feature film) with `0` crashes.
- **Live AWS EC2 `g4dn.xlarge` Benchmarks (`Task-00103` & `Task-00128`):** Executed at **`concurrency = 1`** on `i-02aa4578f3790bae1`:
  - `10` sequential batches of VoiceStudio OmniVoice TTS (`1,385` words, `999.32s` generated audio in `380.305s` GPU compute, `0` errors/retries, `9,837 MiB` peak VRAM).
  - Single-clip TalkNet CUDA inference (`8.04s` media in `9.778s`, `435 MiB` peak VRAM) and AutoFlip native reframing (`8.0s` media in `0.052s`).

---

### Q4.5: What remains unverified in production?

**Defensible Answer:**

1. **End-to-End Vercel $\to$ Redis $\to$ EC2 Worker $\to$ Callback Completion (`Task-00018`):**
   - Currently **blocked in Dev** because `POST https://marvedge-dev.vercel.app/api/jobs/callback` returns `HTTP 503 Service Unavailable` (missing `CALLBACK_SECRET` on Vercel Dev).
   - Live end-to-end execution is also gated on confirming Dev vs. Production database (`marvedge-neon-db-1`) and Upstash Redis (`rested-vulture-192769.upstash.io`) isolation and resolving the Prisma migration tracking baseline (`23` recorded in `_prisma_migrations` vs. `27` local folders; `docs/qa/MARVEDGE-FINAL-CLOSURE-AUDIT.md` §5).
2. **Stopped Production GPU Host & Cold-Start Automation:**
   - AWS EC2 GPU worker `i-02aa4578f3790bae1` is currently **stopped** (`Code 80`). There is no automated queue-depth auto-scaler to boot and stop the EC2 instance dynamically (`90–180s` cold start).
3. **Multi-Job Physical GPU Concurrency (`concurrency > 1`):**
   - Production worker configuration enforces `REFRAME_WORKER_CONCURRENCY=1` and `WORKER_CONCURRENCY=1` (`docs/V3_AI_ARCHITECTURE_AND_OPERATIONS.md` §8.4). Simultaneous execution of TalkNet (`435 MiB` VRAM) and VoiceStudio (`9,837 MiB` VRAM) across multiple concurrent jobs on a single 16 GB Tesla T4 has not been empirically load-tested.
4. **Unmerged Task-00132 Dubbing Remediation (`PR #578`) & Perceptual Lip-Sync:**
   - The hardened `executeDubbingJob` guards (`aa249ef`) remain on branch `task/task-00132-voicestudio-remediation` (PR #578 open), and perceptual human sign-off on lip-synced video dubbing awaits matched source/audio test footage.
5. **AutoFlip Headless Graph Production Update:**
   - The validated single-speaker dynamic configuration (`temp_pipeline_validation/autoflip_expB_kinematic_face_only.pbtxt`, `period: 1`, `motion_stabilization_threshold_percent: 0.05`, `kinematic_options`) has not yet been promoted into `autoflip/autoflip_headless_graph.pbtxt`, and the upstream MediaPipe C++ `keyframe_counter` indexing bug in `SceneCropper::ProcessKinematicPathSolver` remains unpatched for downsampled (`period: 200000`) object-detection graphs.

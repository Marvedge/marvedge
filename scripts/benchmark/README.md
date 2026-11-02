# Cloud Cost Benchmark Harness (Task-0102)

End-to-end performance and cost benchmarking harness for the Marvedge media processing pipeline. Measures latency, throughput, hardware resource utilization, and compute/API cost per completed job and per minute of source media.

---

## 1. Pipeline Stages & Provider Modes

The benchmark measures these 4 stages individually or in an end-to-end pipeline:

1. **Video Reframing (`reframe`)**:
   - `fixture` (default): Pure offline deterministic 9:16 crop filter synthesis validated against `validateCropTargetData` and `buildFfmpegCropFilter`.
   - `autoflip`: Calls the production `callMlInference` client at `AUTOFILP_SERVICE_URL` or `ML_GATEWAY_URL`. Requires an accessible HTTP/HTTPS media URL. If unreachable or media URL cannot be resolved, preflight blocks with `AUTOFILP_SERVICE_URL_UNSET` or `MEDIA_URL_INACCESSIBLE`.
2. **Active Speaker Detection (`avs`)**:
   - `fixture` (default): Offline deterministic active speaker speech segments and confidence scores.
   - `talknet`: Preflight checks presence of `talknet/weights/sfd_face.pth` and `pretrain_TalkSet.model`. If missing, blocks with `TALKNET_WEIGHTS_MISSING`; **automatic weight downloading is strictly disabled**. Submits `POST /detect` to `TALKNET_SERVICE_URL` with an accessible HTTP/HTTPS media URL.
3. **Subtitle Generation and Burn-in (`captions`)**:
   - `fixture` (default): Offline `realisticWhisperVerboseResponse` normalized to valid ASS Dialogue events conforming to burn-in invariants (minimum 300 ms, non-decreasing timestamps).
   - `whisper` / `groq`: Calls live OpenAI Whisper API or Groq Whisper API. Blocks fast with `OPENAI_API_KEY_UNSET` or `GROQ_API_KEY_UNSET` if keys are missing.
4. **Audio Dubbing (`dubbing`)**:
   - `fixture` (default): Offline synthetic dubbing timeline with duration alignment verification ($0.00 external spend).
   - `elevenlabs`: Calls production `createDubbingJob`. Blocks fast with `ELEVENLABS_API_KEY_UNSET` if API key is missing.

_Strict Transparency Rule_: Fixture executions are always labeled `status: "fixture"` and report real-time processing factors as `N/A (fixture)`. Real inference is never claimed for mocked or health-check-only runs.

---

## 2. Telemetry and Measurements

- **Latency**: High-resolution wall-clock durations (`performance.now()`), reporting P50, P95, min, max, mean, and standard deviation.
- **Warm-Up Execution & Cost Accounting Semantics**:
  - Warm-up iterations are executed to prime caches, connections, and worker instances.
  - **Latency separation**: Warm-up wall-clock latency is strictly excluded from measured latency statistics (P50, P95, mean, min, max).
  - **Steady-state measured cost**: Warm-up runs are excluded from the reported steady-state measured benchmark cost.
  - **Provider billing notice**: Real paid-provider warm-up calls (e.g., OpenAI Whisper, Groq, ElevenLabs) can incur actual charges from external providers. The reported benchmark cost represents steady-state measured iterations and is not necessarily equal to the total session spend billed by third parties.
- **Throughput & Concurrency**: Jobs completed per second and real-time processing factor ($x\text{RT} = \text{media duration} / \text{mean duration}$). In fixture mode, $x\text{RT}$ is explicitly reported as `N/A (fixture)`.
- **Hardware Telemetry**:
  - **CPU**: Model, core count, average & peak utilization percentage.
  - **RAM**: Total system memory, free memory, and process RSS (peak and average).
  - **GPU**: Non-blocking asynchronous polling via `nvidia-smi` capturing VRAM peak used, total VRAM, GPU utilization %, and temperature. When no GPU or `nvidia-smi` is available, metrics explicitly report `isAvailable: false` with null values�**never fabricated zeroes**. Unsupported individual metric values such as `N/A` or `[Not Supported]` are safely parsed as `null`.

---

## 3. Cost Accounting Engine

Pricing baseline derives from [`docs/GPU_COST_CONCURRENCY.md`](../../docs/GPU_COST_CONCURRENCY.md):

| Instance / Provider              | Rate            | Source / Assumption                             |
| :------------------------------- | :-------------- | :---------------------------------------------- |
| **Cloud Run NVIDIA L4 (24GB)**   | $0.80 / hr      | Google Cloud Run GPU pricing (Q3 2026)          |
| **Cloud Run NVIDIA T4 (16GB)**   | $0.35 / hr      | Google Cloud Run GPU pricing (Q3 2026)          |
| **Standard CPU (4 vCPU / 16GB)** | $0.09 / hr      | Standard Cloud Run general compute assumption   |
| **OpenAI Whisper Transcription** | $0.006 / min    | Public Whisper API rate reference (assumption)  |
| **ElevenLabs Audio Dubbing**     | $0.15 / min     | Standard ElevenLabs rate reference (assumption) |
| **Offline Fixture Mode**         | **$0.00 / min** | Strictly zero external spend                    |

### Multi-Iteration Scaling Formulas

- **Compute Cost (USD)**:
  $$\text{Compute Cost} = \frac{\text{Measured Wall-Clock Seconds}}{3600} \times \text{Configured Hourly Rate}$$
- **External API Cost (USD)**:
  $$\text{External Cost} = \text{Completed Jobs} \times \text{Media Minutes} \times \text{Provider Per-Minute Rate}$$
  _(Strictly $\$0.00$ in fixture mode)_
- **Cost per Completed Job (USD/job)**:
  $$\text{Cost per Completed Job} = \frac{\text{Total Cost}}{\text{Completed Jobs}}$$
- **Cost per Media Minute (USD/min)**:
  $$\text{Cost per Media Minute} = \frac{\text{Cost per Completed Job}}{\text{Media Minutes}} = \frac{\text{Total Cost}}{\text{Completed Jobs} \times \text{Media Minutes}}$$

Handles zero-duration inputs, failed runs, or missing pricing gracefully without division errors or misleading metrics.

---

## 4. Real Provider Input Media Configuration

Real AutoFlip and TalkNet services require an accessible HTTP or HTTPS URL to download input media:

1. **Remote HTTP/HTTPS media**: Provide directly via `--input https://example.com/video.mp4` or via environment variable `BENCHMARK_MEDIA_URL=https://...`.
2. **Local / Synthetic media in Docker or Cloud**:
   - To serve local or synthetic test clips to containerized services, set `BENCHMARK_SERVE_LOCAL_MEDIA=true`.
   - Configure `BENCHMARK_MEDIA_HOST` (e.g. `host.docker.internal` or bridge IP `172.17.0.1` for local Docker, or internal DNS in Kubernetes/ECS) and `BENCHMARK_SERVER_PORT`.
   - The harness launches an ephemeral, bounded HTTP server serving only the designated media file with path traversal protections and cleans it up immediately upon completion.
   - If a local file is passed to a real remote service without an accessible HTTP URL or serving configuration, the harness immediately returns a descriptive `MEDIA_URL_INACCESSIBLE` blocked result rather than failing silently with an invalid local path.

---

## 5. CLI Usage & Flags

### Basic Offline Run (Zero Cost)

```bash
npm run benchmark:cloud-cost
```

Or directly with `tsx`:

```bash
npx tsx scripts/benchmark/cloudCostBenchmark.ts \
  --stages reframe,avs,captions,dubbing \
  --concurrency 2 \
  --iterations 4 \
  --warmup 2 \
  --output-json benchmark_results/cloud_cost_report.json \
  --output-markdown benchmark_results/cloud_cost_report.md
```

### CLI Flags Reference

| Option                     | Description                                                                  | Default                                    |
| :------------------------- | :--------------------------------------------------------------------------- | :----------------------------------------- |
| `--input <path>`           | Path to source video or HTTP URL (generates synthetic clip if omitted)       | Synthetic 5s clip                          |
| `--stages <list>`          | Comma-separated list or `all` (`reframe,avs,captions,dubbing`)               | `all`                                      |
| `--concurrency <N>`        | Number of concurrent jobs                                                    | `1`                                        |
| `--iterations <N>`         | Number of measured iterations                                                | `1`                                        |
| `--warmup <N>`             | Number of warm-up iterations (excluded from latency stats and measured cost) | `0`                                        |
| `--gpu-type <type>`        | Compute instance pricing model: `L4`, `T4`, `custom`, `none`, `CPU`          | `L4`                                       |
| `--hourly-rate <usd>`      | Custom compute instance hourly rate override                                 | Config default                             |
| `--provider-reframe`       | `fixture` or `autoflip`                                                      | `fixture`                                  |
| `--provider-avs`           | `fixture` or `talknet`                                                       | `fixture`                                  |
| `--provider-transcription` | `fixture`, `whisper`, or `groq`                                              | `fixture`                                  |
| `--provider-dubbing`       | `fixture` or `elevenlabs`                                                    | `fixture`                                  |
| `--output-json <path>`     | Path to write machine-readable JSON report (schema 1.1.0)                    | `benchmark_results/cloud_cost_report.json` |
| `--output-markdown <path>` | Path to write human-readable Markdown report                                 | `benchmark_results/cloud_cost_report.md`   |
| `--verbose`                | Output detailed progress logs                                                | `false`                                    |

### Exit Code Semantics

- `0`: All stages completed or partial execution succeeded with diagnostic notes.
- `1`: Total failure (all stages failed or required provider prerequisites blocked).

---

## 6. Docker & Containerized Execution

A dedicated benchmark profile is configured in `docker-compose.yml`. Standard service execution remains unaffected.

```bash
docker compose --profile benchmark run --rm benchmark \
  --stages reframe,avs,captions,dubbing \
  --concurrency 1 \
  --iterations 3
```

Results are mounted to `./benchmark_results` on the host machine.

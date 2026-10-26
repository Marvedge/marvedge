# VoiceStudio Integration & Local GPU Dubbing Guide (Task-00103)

This document details the architectural integration of **VoiceStudio** into Marvedge's dubbing and cloud-cost benchmark pipeline.

---

## 1. Architectural Overview & Boundaries

VoiceStudio is an open-source, multi-engine speech generation system (licensed under AGPL-3.0). To preserve Marvedge's codebase independence and licensing integrity:

1. **Isolated Container Architecture:**
   - VoiceStudio runs in a dedicated standalone container (`docker-compose.voicestudio.yml`).
   - Communication occurs strictly over authenticated HTTP (`127.0.0.1:3900`).
   - No Python dependencies, CUDA code, or AGPL-3.0 source files are imported or copied into Marvedge.

2. **Network Security & Port Binding:**
   - Port 3900 is strictly bound to `127.0.0.1:3900` (loopback only).
   - Port 3900 is never exposed publicly and is never added to AWS Security Groups.

3. **Authentication & Secret Hygiene:**
   - Authorization is enforced on every request via `Authorization: Bearer <token>`.
   - All errors and logs are scrubbed via `sanitizeMessage()` to prevent token leaks.
   - Credentials are provided via environment variables (`VOICESTUDIO_API_KEY`) and never committed.

4. **Preserved Defaults & Fail-Safe Fallbacks:**
   - `DUBBING_PROVIDER=elevenlabs` remains the default production provider.
   - When VoiceStudio is selected (`DUBBING_PROVIDER=voicestudio`) and unavailable, it fails with a clear, typed error (`VOICESTUDIO_UNAVAILABLE`).
   - Automatic fallback to paid ElevenLabs calls is strictly disabled by default (`VOICESTUDIO_FALLBACK_TO_PAID=false`), preventing unexpected billing surges.

---

## 2. Hardware Profile: NVIDIA Tesla T4 (EC2 g4dn.xlarge)

VoiceStudio runs on NVIDIA Turing architecture (`sm_75` compute capability, 16 GB GDDR6 VRAM).

| Parameter | Setting | Rationale |
| :--- | :--- | :--- |
| **Precision** | `torch.float16` | Optimal for Turing Tensor Cores |
| **Attention** | `sdpa` (PyTorch Scaled Dot-Product) | Standard, stable attention on Turing |
| **Torch Compile** | `TORCH_COMPILE_DISABLE=1` | Disabled: dynamic speech shapes cause recompilation overhead and runtime segfaults |
| **CUDA Graphs** | Disabled | Dynamic audio durations require variable sequence lengths |
| **Peak VRAM** | ~2.48 GB (OmniVoice) | Easily fits within the 16 GB budget with room for concurrency |

### Model Licensing Notes
- Default **OmniVoice** weights are licensed under **CC-BY-NC 4.0** (Non-Commercial). It is permitted for internal research, benchmarking, and architectural evaluation.
- For commercial production pipelines, permissible open-weights models (such as **Kokoro-82M**, Apache-2.0) can be configured via `VOICESTUDIO_MODEL=kokoro-82m`.

---

## 3. Deployment Configuration (`docker-compose.voicestudio.yml`)

```yaml
name: marvedge-voicestudio
services:
  voicestudio:
    container_name: marvedge-voicestudio
    image: ghcr.io/debpalash/voicestudio:0.5.6
    restart: unless-stopped
    ports:
      - "127.0.0.1:3900:3900"
    environment:
      - OMNIVOICE_SERVER_MODE=1
      - OMNIVOICE_DATA_DIR=/app/omnivoice_data
      - HF_HOME=/app/omnivoice_data/huggingface
      - OMNIVOICE_API_KEY=${VOICESTUDIO_API_KEY:?VOICESTUDIO_API_KEY must be configured before starting VoiceStudio}
      - PYTHONUNBUFFERED=1
      - TORCH_COMPILE_DISABLE=1
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    volumes:
      - voicestudio-data:/app/omnivoice_data
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:3900/health"]
      interval: 15s
      timeout: 5s
      retries: 6
      start_period: 60s

volumes:
  voicestudio-data:
    name: marvedge-voicestudio-data
```

---

## 4. Benchmark Harness Integration (Task-0102)

VoiceStudio is fully integrated as a zero-external-cost dubbing provider in `scripts/benchmark/cloudCostBenchmark.ts`:

### CLI Usage Flags:
- `--provider-dubbing=voicestudio`: Activates VoiceStudio dubbing provider.
- `--voicestudio-url=<url>`: Custom base URL (default: `http://127.0.0.1:3900`).
- `--voicestudio-api-key=<key>`: Custom authorization key (default: read from env).
- `--voicestudio-model=<model>`: Target model name (default: `omnivoice`).
- `--voicestudio-fallback-to-paid`: Explicit opt-in flag for paid ElevenLabs fallback.

### Cost Accounting:
- External API cost is strictly accounted as **$0.000000 USD**.
- EC2 compute cost is tracked separately based on GPU hardware hourly rates ($0.526/hr for `g4dn.xlarge`).

---

## 5. Offline Testing & Verification

To verify client logic, error handling, audio validation, and benchmark calculations without starting the GPU host:

```bash
# Run unit tests for VoiceStudio adapter
npx vitest run app/lib/voicestudio/__tests__

# Run benchmark harness tests (including VoiceStudio provider tests)
npx vitest run scripts/benchmark/cloudCostBenchmark/__tests__

# Run TypeScript typecheck
npx tsc --noEmit
```

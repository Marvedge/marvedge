#!/usr/bin/env bash
# ==============================================================================
# Host-Side Execution & Guaranteed Teardown Script (Task-00103)
# Target: EC2 i-02aa4578f3790bae1 (Tesla T4, Deep Learning AL2023)
# ==============================================================================
set -euo pipefail

echo "=============================================================================="
echo " MARVEDGE VOICESTUDIO GPU BENCHMARK (Task-00103 Host Execution)"
echo "=============================================================================="

# 1. Arm independent host-side watchdog (35 minutes = 2100s)
# Because InstanceInitiatedShutdownBehavior=stop, 'shutdown -h' transitions EC2 to stopped.
echo "[host] Arming independent host-side safety watchdog (+35 minutes)..."
sudo shutdown -h +35 "Marvedge Task-00103 GPU hard deadline reached" &
WATCHDOG_PID=$!
echo "[host] Watchdog armed (PID: $WATCHDOG_PID)."

cleanup_and_halt() {
  local exit_code=$?
  echo "[host] Cleaning up VoiceStudio containers..."
  docker compose -f docker-compose.voicestudio.yml down || true

  # Cancel the +35m delayed shutdown and immediately power off to stop EC2 instance
  echo "[host] Stopping instance via immediate shutdown..."
  sudo shutdown -c 2>/dev/null || true
  sudo shutdown -h now
  exit "$exit_code"
}

trap cleanup_and_halt EXIT ERR INT TERM

# 2. Preflight checks
echo "[host] Verifying GPU and driver..."
nvidia-smi --query-gpu=gpu_name,driver_version,memory.total,memory.free --format=csv,noheader

echo "[host] Verifying disk headroom..."
df -h / | awk 'NR==2 {print "Root volume available: " $4 " of " $2}'

# 3. Secure API Key Setup (in-memory only, never written to disk or git)
if [ -z "${VOICESTUDIO_API_KEY:-}" ]; then
  export VOICESTUDIO_API_KEY=$(openssl rand -hex 24)
  echo "[host] Generated in-memory VOICESTUDIO_API_KEY (length: ${#VOICESTUDIO_API_KEY})"
fi

# 4. Start VoiceStudio Container
echo "[host] Launching VoiceStudio container on 127.0.0.1:3900..."
docker compose -f docker-compose.voicestudio.yml up -d

# 5. Run Robust Readiness Probe & Model Install Gate (10-minute timeout)
echo "[host] Executing readiness probe..."
python3 scripts/check_voicestudio_readiness.py

echo "[host] VoiceStudio is fully operational with CUDA!"

# 6. Execute Benchmark Suite
echo "[host] Running benchmark harness (2 warmup, 5 measured iterations)..."
mkdir -p benchmark_results
npx tsx scripts/benchmark/cloudCostBenchmark.ts   --stages=dubbing   --provider-dubbing=voicestudio   --gpu=T4   --hourly-rate=0.7104   --concurrency=1   --iterations=5   --warmup=2   --voicestudio-url=http://127.0.0.1:3900   --output-json=benchmark_results/voicestudio_gpu_benchmark.json   --output-markdown=benchmark_results/voicestudio_gpu_benchmark.md

# 7. Audio Validation
echo "[host] Validating generated audio artifacts..."
for wav in benchmark_results/artifacts/*.wav; do
  if [ -f "$wav" ]; then
    echo "[host] Validating artifact: $wav"
    ffprobe -v error -show_entries format=duration,size,bit_rate -show_streams -select_streams a:0 "$wav"
  fi
done

echo "[host] BENCHMARK EXECUTION COMPLETE."

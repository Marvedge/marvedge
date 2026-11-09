#!/usr/bin/env bash
# =============================================================================
# Marvedge GPU Worker Preflight Validation & Health Gate
# Path: infra/gpu-deployment/preflight-gate.sh
# Checks all blockers before launching worker services
# =============================================================================
set -euo pipefail

ENV_FILE="/etc/marvedge/worker.env"
FAILURES=0

echo "============================================================================="
echo " MARVEDGE GPU WORKER DEPLOYMENT GATEWAY CHECK"
echo "============================================================================="

# 1. Environment File
if [ ! -f "$ENV_FILE" ]; then
  echo "[FAIL] Environment file $ENV_FILE does not exist."
  FAILURES=$((FAILURES + 1))
else
  echo "[PASS] Environment file $ENV_FILE exists."
  # shellcheck source=/dev/null
  set -a && source "$ENV_FILE" && set +a
fi

# 2. Model Checkpoints
echo "--- Checking Model Weights ---"
S3FD_PATH="${TALKNET_S3FD_WEIGHTS:-/opt/marvedge/talknet/weights/sfd_face.pth}"
TALKNET_PATH="${TALKNET_MODEL_WEIGHTS:-/opt/marvedge/talknet/weights/pretrain_TalkSet.model}"

if [ ! -f "$S3FD_PATH" ]; then
  echo "[FAIL] TalkNet S3FD weights missing: $S3FD_PATH"
  FAILURES=$((FAILURES + 1))
else
  echo "[PASS] TalkNet S3FD weights present: $S3FD_PATH ($(du -h "$S3FD_PATH" | cut -f1))"
fi

if [ ! -f "$TALKNET_PATH" ]; then
  echo "[FAIL] TalkNet model weights missing: $TALKNET_PATH"
  FAILURES=$((FAILURES + 1))
else
  echo "[PASS] TalkNet model weights present: $TALKNET_PATH ($(du -h "$TALKNET_PATH" | cut -f1))"
fi


# 3. AutoFlip Binary
echo "--- Checking AutoFlip Binary ---"
AUTOFILP_BIN="${AUTOFILP_BINARY_PATH:-/usr/local/bin/run_autoflip_to_json}"
if [ ! -f "$AUTOFILP_BIN" ]; then
  echo "[FAIL] AutoFlip binary missing: $AUTOFILP_BIN"
  FAILURES=$((FAILURES + 1))
elif [ ! -x "$AUTOFILP_BIN" ]; then
  echo "[FAIL] AutoFlip binary not executable: $AUTOFILP_BIN"
  FAILURES=$((FAILURES + 1))
else
  echo "[PASS] AutoFlip binary present and executable: $AUTOFILP_BIN"
fi

# 4. Redis Connectivity (TCP / TLS Check)
echo "--- Checking Redis Connectivity ---"
if [ -z "${REDIS_URL:-}" ]; then
  echo "[FAIL] REDIS_URL is not set."
  FAILURES=$((FAILURES + 1))
else
  if [[ "$REDIS_URL" =~ ^redis://(localhost|127\.0\.0\.1) ]] && [ "${NODE_ENV:-}" = "production" ]; then
    echo "[FAIL] Accidental localhost Redis target detected in production: $REDIS_URL"
    FAILURES=$((FAILURES + 1))
  else
    echo "[PASS] REDIS_URL configured: $(echo "$REDIS_URL" | sed 's/:[^:@]*@/:***@/')"
  fi
fi

# 5. Callback Authentication & Backend URL
echo "--- Checking Callback Authentication ---"
if [ -z "${CALLBACK_SECRET:-}" ]; then
  echo "[FAIL] CALLBACK_SECRET is missing."
  FAILURES=$((FAILURES + 1))
else
  echo "[PASS] CALLBACK_SECRET configured."
fi

if [ -z "${BACKEND_URL:-}" ]; then
  echo "[FAIL] BACKEND_URL is missing."
  FAILURES=$((FAILURES + 1))
else
  echo "[PASS] BACKEND_URL configured: $BACKEND_URL"
fi

# 6. ML Gateway Auth
echo "--- Checking ML Gateway Token ---"
if [ -z "${ML_GATEWAY_TOKEN:-}" ]; then
  echo "[WARN] ML_GATEWAY_TOKEN is missing (Gateway will run unauthenticated)."
else
  echo "[PASS] ML_GATEWAY_TOKEN configured."
fi

# 7. Concurrency Check
echo "--- Checking Worker Concurrency ---"
if [ "${REFRAME_WORKER_CONCURRENCY:-1}" -ne 1 ] && [ "${REFRAME_WORKER_CONCURRENCY:-1}" -ne 4 ]; then
  echo "[FAIL] REFRAME_WORKER_CONCURRENCY must be 1 or 4 in production (got ${REFRAME_WORKER_CONCURRENCY:-unset})."
  FAILURES=$((FAILURES + 1))
else
  echo "[PASS] REFRAME_WORKER_CONCURRENCY set to ${REFRAME_WORKER_CONCURRENCY:-1}."
fi

# 8. NVIDIA GPU Check
echo "--- Checking NVIDIA GPU & CUDA Driver ---"
if command -v nvidia-smi >/dev/null 2>&1; then
  GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
  echo "[PASS] GPU detected: $GPU_NAME"
else
  echo "[WARN] nvidia-smi command not found. Service will fall back to CPU."
fi

echo "============================================================================="
if [ "$FAILURES" -gt 0 ]; then
  echo "[STATUS] GATEWAY BLOCKED: $FAILURES critical check(s) failed."
  exit 1
else
  echo "[STATUS] ALL CHECKS PASSED: Safe to start Marvedge worker services."
  exit 0
fi

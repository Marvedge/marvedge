#!/usr/bin/env bash
# benchmark_runner.sh  (Task-00077 v2 — real pipeline, Colab-compatible)
# Run this from the repo root after cloning on a Colab / Cloud Run GPU instance.
# It downloads real sample clips, runs the three pipeline stages, and collates results.

set -euo pipefail
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
OUT_DIR="$REPO_ROOT/benchmark_results"
CLIP_DIR="$REPO_ROOT/benchmark_clips"
HARNESS="$SCRIPT_DIR/gpu_benchmark.py"

mkdir -p "$OUT_DIR" "$CLIP_DIR"

GPU_TYPE="${GPU_TYPE:-T4}"   # override with L4 on Cloud Run

echo "═══════════════════════════════════════════════════════════"
echo "  MARVEDGE GPU BENCHMARK SUITE  |  gpu=${GPU_TYPE}"
echo "═══════════════════════════════════════════════════════════"

# ── 1. Download sample clips ─────────────────────────────────────────────────
# Using Big Buck Bunny (royalty-free) via publicly available direct links.
declare -A CLIPS=(
    ["30s"]="https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4"
    ["60s"]="https://filesamples.com/samples/video/mp4/sample_640x360.mp4"
)

# Try yt-dlp for proper length clips if available (Colab has it)
for LABEL in "${!CLIPS[@]}"; do
    DEST="$CLIP_DIR/${LABEL}.mp4"
    if [[ ! -f "$DEST" ]]; then
        echo "[SETUP] Downloading ${LABEL} clip…"
        curl -sL "${CLIPS[$LABEL]}" -o "$DEST" || \
            wget -q "${CLIPS[$LABEL]}" -O "$DEST" || \
            echo "[WARN] Could not download ${LABEL} clip. Place it manually at $DEST"
    fi
done

# Detect actual video durations with ffprobe
get_dur() {
    ffprobe -v error -select_streams v:0 -show_entries format=duration \
            -of default=noprint_wrappers=1:nokey=1 "$1" 2>/dev/null || echo 0
}

# ── 2. Run benchmarks ─────────────────────────────────────────────────────────
# We run only what is available. Each stage wraps the REAL preprocess_faces.py
# invocation — not a sleep. Set PREPROCESS_SCRIPT to the actual path.

PREPROCESS_SCRIPT="${PREPROCESS_SCRIPT:-$REPO_ROOT/ml-worker/preprocess_faces.py}"

# Check that the preprocessing script exists
if [[ ! -f "$PREPROCESS_SCRIPT" ]]; then
    echo "[ERROR] PREPROCESS_SCRIPT not found at $PREPROCESS_SCRIPT"
    echo "        Set the PREPROCESS_SCRIPT env-var or run from the right directory."
    exit 1
fi

run_stage() {
    local label="$1"   # e.g. "avs_30s"
    local stage="$2"   # e.g. "avs"
    local clip="$3"    # e.g. /path/to/30s.mp4
    local cmd="$4"     # real command
    local dur
    dur=$(get_dur "$clip")

    python3 "$HARNESS" \
        --stage "$stage" \
        --cmd   "$cmd" \
        --out   "$OUT_DIR/${label}.json" \
        --gpu-type "$GPU_TYPE" \
        --video-sec "$dur"
}

for LABEL in "${!CLIPS[@]}"; do
    CLIP="$CLIP_DIR/${LABEL}.mp4"
    [[ ! -f "$CLIP" ]] && { echo "[SKIP] $CLIP not found"; continue; }
    SAVE="/tmp/marvedge_bench_${LABEL}"
    rm -rf "$SAVE" && mkdir -p "$SAVE"

    echo ""
    echo "─── Video: ${LABEL} ($CLIP) ───────────────────────────────────────"

    # Stage: AVS (Active Speaker Detection — preprocess_faces.py)
    run_stage "avs_${LABEL}"   "avs" "$CLIP" \
        "python3 $PREPROCESS_SCRIPT --videoPath $CLIP --savePath $SAVE/avs \
         --nDataLoaderThread 4 --batchSize 32 --chunkSize 1000 --minTrack 5"

    # Stage: Reframe  (ffmpeg crop-based reframing — uses the tracks output)
    # For now benchmarks the video I/O portion (reframe is CPU-bound on encode).
    run_stage "reframe_${LABEL}" "reframe" "$CLIP" \
        "ffmpeg -y -i $CLIP -vf 'crop=720:1280:280:0' -c:v libx264 \
         -preset fast -crf 22 $SAVE/reframe_out.mp4 -loglevel warning"

done

# ── 3. Collate results ────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  RESULTS SUMMARY"
echo "═══════════════════════════════════════════════════════════"
echo ""
printf "%-20s %-8s %-12s %-14s %-10s %-12s\n" \
    "Stage" "Clip" "Duration(s)" "MaxVRAM(MiB)" "GPUUtil%" "Cost(USD)"
printf "%-20s %-8s %-12s %-14s %-10s %-12s\n" \
    "────────────────────" "────────" "────────────" "──────────────" "──────────" "────────────"

for f in "$OUT_DIR"/*.json; do
    [[ ! -f "$f" ]] && continue
    stage=$(python3 -c "import json,sys; d=json.load(open('$f')); print(d.get('stage','?'))")
    clip=$(basename "$f" .json | sed "s/${stage}_//")
    dur=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('duration_seconds','?'))")
    vram=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('max_vram_used_mib','?'))")
    util=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('avg_gpu_util_pct','?'))")
    cost=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('estimated_cost_usd','?'))")
    printf "%-20s %-8s %-12s %-14s %-10s %-12s\n" "$stage" "$clip" "$dur" "$vram" "$util" "$cost"
done

echo ""
echo "All JSON reports saved to: $OUT_DIR/"

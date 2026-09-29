#!/usr/bin/env bash
# benchmark_runner.sh
# Runs the GPU benchmarking harness across different video lengths and stages.

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$(dirname "$(dirname "$DIR")")"
OUT_DIR="$REPO_ROOT/benchmark_results"

mkdir -p "$OUT_DIR"

echo "[BENCHMARK] Starting Full Pipeline GPU Benchmark Suite..."
echo "[BENCHMARK] Output directory: $OUT_DIR"

# Test cases: mock videos or real paths. For local runs, we will use mock sleeps if scripts aren't mounted,
# but the harness is designed to take the real commands.
# In production, swap these dummy commands with the actual ML container CLI calls.

STAGES=("reframe" "avs" "dubbing")
VIDEOS=("clip_30s.mp4" "clip_60s.mp4" "clip_3m.mp4" "clip_10m.mp4")

# For this test runner, we will simulate the processing times.
# reframe: ~0.5x realtime
# avs: ~0.2x realtime (YuNet + TalkNet)
# dubbing: ~1.0x realtime (TTS + inference)

for video in "${VIDEOS[@]}"; do
    echo "---------------------------------------------------"
    echo "Benchmarking Video: $video"
    echo "---------------------------------------------------"

    if [[ "$video" == "clip_30s.mp4" ]]; then length=30; fi
    if [[ "$video" == "clip_60s.mp4" ]]; then length=60; fi
    if [[ "$video" == "clip_3m.mp4" ]]; then length=180; fi
    if [[ "$video" == "clip_10m.mp4" ]]; then length=600; fi

    for stage in "${STAGES[@]}"; do
        if [[ "$stage" == "reframe" ]]; then sleep_time=$(echo "$length * 0.5" | bc); fi
        if [[ "$stage" == "avs" ]]; then sleep_time=$(echo "$length * 0.2" | bc); fi
        if [[ "$stage" == "dubbing" ]]; then sleep_time=$(echo "$length * 1.0" | bc); fi
        
        # We cap the sleep time for the mock run so it doesn't take an hour to run locally
        # 1/10th scale for the mock runner just to verify the harness works
        scaled_sleep=$(echo "$sleep_time * 0.1" | bc)
        cmd="sleep $scaled_sleep"

        out_json="$OUT_DIR/${stage}_${length}s.json"

        python3 "$DIR/gpu_benchmark.py" \
            --stage "$stage" \
            --cmd "$cmd" \
            --out "$out_json"
    done
done

echo ""
echo "[BENCHMARK] Suite complete! Collating results..."
echo "Stage | Video Length | Max VRAM | Duration | Cost ($)"
echo "---|---|---|---|---"
for file in "$OUT_DIR"/*.json; do
    stage=$(jq -r '.stage' "$file")
    length=$(basename "$file" | sed 's/.*_//' | sed 's/\.json//')
    vram=$(jq -r '.max_vram_mib' "$file")
    duration=$(jq -r '.duration_seconds' "$file")
    cost=$(jq -r '.estimated_cost_usd' "$file")
    echo "$stage | $length | ${vram}MB | ${duration}s | \$$cost"
done

#!/usr/bin/env bash
# =============================================================================
# run_task46_benchmark.sh — Task-00046: Throughput & GPU Benchmarking
#                           on Realistic Long-Form Video Lengths
#
# Usage:
#   # Face-crop pipeline benchmark (panel/podcast video):
#   bash scripts/ml/run_task46_benchmark.sh --mode face --video /path/to/20min_podcast.mp4
#
#   # Cursor detection benchmark (screen recording):
#   bash scripts/ml/run_task46_benchmark.sh --mode cursor --video /path/to/20min_screenrec.mp4
#
#   # Run BOTH sequentially:
#   bash scripts/ml/run_task46_benchmark.sh --mode both \
#       --face_video /path/to/podcast.mp4 \
#       --cursor_video /path/to/screenrec.mp4
#
# Outputs are written to:
#   demo/task46_results/face_benchmark/benchmark_report.json
#   demo/task46_results/cursor_benchmark/cursor_track.json
#   demo/task46_results/summary.json
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VENV_PYTHON="$REPO_ROOT/venv/bin/python"
RESULTS_DIR="$REPO_ROOT/demo/task46_results"

# ── Defaults ──────────────────────────────────────────────────────────────────
MODE="face"
FACE_VIDEO=""
CURSOR_VIDEO=""
VIDEO=""               # shared flag for single-mode runs
FRAME_SKIP=2           # cursor: process every 2nd frame (good for 20min @ 30fps)
CURSOR_CONFIDENCE=0.65
FAST=false             # use optimized pipeline
DETECTION_STRIDE=3     # detect every Nth frame (fast mode)
DETECTION_SCALE=0.5    # half-resolution detection (fast mode)
WORKERS=4              # parallel crop workers (fast mode)

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --mode)             MODE="$2";             shift 2 ;;
        --video)            VIDEO="$2";            shift 2 ;;
        --face_video)       FACE_VIDEO="$2";       shift 2 ;;
        --cursor_video)     CURSOR_VIDEO="$2";     shift 2 ;;
        --frame_skip)       FRAME_SKIP="$2";       shift 2 ;;
        --confidence)       CURSOR_CONFIDENCE="$2"; shift 2 ;;
        --fast)             FAST=true;             shift 1 ;;
        --detection_stride) DETECTION_STRIDE="$2"; shift 2 ;;
        --detection_scale)  DETECTION_SCALE="$2";  shift 2 ;;
        --workers)          WORKERS="$2";          shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

# If --video provided for single-mode, route to appropriate var
if [[ -n "$VIDEO" ]]; then
    if [[ "$MODE" == "face" ]]; then
        FACE_VIDEO="$VIDEO"
    elif [[ "$MODE" == "cursor" ]]; then
        CURSOR_VIDEO="$VIDEO"
    fi
fi

mkdir -p "$RESULTS_DIR/face_benchmark"
mkdir -p "$RESULTS_DIR/cursor_benchmark"

# ── Sanity check: Python + deps ───────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║        Task-00046 — Realistic Long-Form Benchmark Runner         ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "→ Checking environment..."
"$VENV_PYTHON" -c "import cv2, numpy, scipy; print('  ✅ Core deps OK')"
"$VENV_PYTHON" -c "import scenedetect; print('  ✅ scenedetect OK')" 2>/dev/null || echo "  ⚠️  scenedetect not available — single-scene fallback will apply"
"$VENV_PYTHON" -c "import torch; print('  ✅ PyTorch OK, CUDA:', 'YES' if __import__('torch').cuda.is_available() else 'NO (CPU only)')" 2>/dev/null || echo "  ⚠️  PyTorch not available — face detection uses YuNet CPU fallback"
echo ""

START_TIME=$(date +%s)

# ═══════════════════════════════════════════════════════════════════════════════
# STAGE A — Face-Crop Pipeline Benchmark
# ═══════════════════════════════════════════════════════════════════════════════
run_face_benchmark() {
    local video="$1"

    if [[ "$FAST" == "true" ]]; then
        PIPELINE_LABEL="⚡ FAST (strided+half-res+streaming+parallel)"
        PIPELINE_SCRIPT="scripts/ml/benchmark_preprocessing_fast.py"
    else
        PIPELINE_LABEL="Standard"
        PIPELINE_SCRIPT="scripts/ml/benchmark_preprocessing.py"
    fi

    echo "┌──────────────────────────────────────────────────────────────────┐"
    echo "│  STAGE A: Face-Crop Preprocessing Pipeline (Task-00046)         │"
    echo "│  Mode: ${PIPELINE_LABEL}"
    echo "│  Video: $(basename "$video")"
    echo "└──────────────────────────────────────────────────────────────────┘"
    echo ""

    if [[ ! -f "$video" ]]; then
        echo "  ❌ ERROR: Face video not found at: $video"
        echo "     Please provide a podcast/panel/conference video (20+ min recommended)"
        exit 1
    fi

    DURATION=$(ffprobe -v error -show_entries format=duration \
        -of default=noprint_wrappers=1:nokey=1 "$video" 2>/dev/null || echo "unknown")
    echo "  Video duration: ${DURATION}s (~$(echo "$DURATION / 60" | bc -l | xargs printf '%.1f') min)"

    if [[ "$FAST" == "true" ]]; then
        echo "  Stride: every ${DETECTION_STRIDE} frames | Scale: ${DETECTION_SCALE}x | Workers: ${WORKERS}"
    fi
    echo ""

    cd "$REPO_ROOT"

    BASE_ARGS=(
        --videoPath  "$video"
        --savePath   "$RESULTS_DIR/face_benchmark"
        --reportPath "$RESULTS_DIR/face_benchmark/benchmark_report.json"
        --nDataLoaderThread 10
        --facedetScale 0.25
        --minTrack 10
        --numFailedDet 100
        --cropScale 0.40
    )

    if [[ "$FAST" == "true" ]]; then
        "$VENV_PYTHON" "$PIPELINE_SCRIPT" \
            "${BASE_ARGS[@]}" \
            --detectionStride "$DETECTION_STRIDE" \
            --detectionScale  "$DETECTION_SCALE" \
            --workers         "$WORKERS"
    else
        "$VENV_PYTHON" "$PIPELINE_SCRIPT" "${BASE_ARGS[@]}"
    fi

    echo ""
    echo "  ✅ Face benchmark report: $RESULTS_DIR/face_benchmark/benchmark_report.json"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# STAGE B — Cursor Detection Benchmark
# ═══════════════════════════════════════════════════════════════════════════════
run_cursor_benchmark() {
    local video="$1"
    echo "┌──────────────────────────────────────────────────────────────────┐"
    echo "│  STAGE B: Universal Cursor Detection (Task-00046)               │"
    echo "│  Video: $(basename "$video")"
    echo "│  Frame skip: every ${FRAME_SKIP} frames | Confidence: ${CURSOR_CONFIDENCE}"
    echo "└──────────────────────────────────────────────────────────────────┘"
    echo ""

    if [[ ! -f "$video" ]]; then
        echo "  ❌ ERROR: Cursor video not found at: $video"
        echo "     Please provide a screen recording (macOS/Windows, 20min recommended)"
        exit 1
    fi

    DURATION=$(ffprobe -v error -show_entries format=duration \
        -of default=noprint_wrappers=1:nokey=1 "$video" 2>/dev/null || echo "unknown")
    echo "  Video duration: ${DURATION}s (~$(echo "$DURATION / 60" | bc -l | xargs printf '%.1f') min)"
    echo ""

    CURSOR_JSON="$RESULTS_DIR/cursor_benchmark/cursor_track.json"

    cd "$REPO_ROOT"
    "$VENV_PYTHON" scripts/ml/cursor_detector.py \
        --video           "$video" \
        --output          "$CURSOR_JSON" \
        --skip            "$FRAME_SKIP" \
        --min_confidence  "$CURSOR_CONFIDENCE" \
        --max_hold_frames 15

    echo ""
    echo "  ✅ Cursor track saved: $CURSOR_JSON"

    # Optional visualization (skips if video is very long to save time)
    if python3 -c "d=float('${DURATION}') if '${DURATION}'!='unknown' else 9999; exit(0 if d < 1200 else 1)" 2>/dev/null; then
        VIZ_OUT="$RESULTS_DIR/cursor_benchmark/cursor_viz.mp4"
        echo "  → Rendering cursor visualization video..."
        "$VENV_PYTHON" scripts/ml/visualize_cursor.py \
            --video  "$video" \
            --json   "$CURSOR_JSON" \
            --output "$VIZ_OUT"
        echo "  ✅ Visualization: $VIZ_OUT"
    else
        echo "  ℹ️  Skipping visualization render (video > 20min). Run visualize_cursor.py manually."
    fi
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# DISPATCH
# ═══════════════════════════════════════════════════════════════════════════════
case "$MODE" in
    face)   run_face_benchmark "$FACE_VIDEO" ;;
    cursor) run_cursor_benchmark "$CURSOR_VIDEO" ;;
    both)
        if [[ -z "$FACE_VIDEO" || -z "$CURSOR_VIDEO" ]]; then
            echo "  ❌ --mode both requires --face_video AND --cursor_video"
            exit 1
        fi
        run_face_benchmark "$FACE_VIDEO"
        run_cursor_benchmark "$CURSOR_VIDEO"
        ;;
    *)
        echo "Unknown mode: $MODE (use: face | cursor | both)"
        exit 1
        ;;
esac

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY JSON
# ═══════════════════════════════════════════════════════════════════════════════
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

"$VENV_PYTHON" - <<PYEOF
import json, os, datetime

results_dir = "$RESULTS_DIR"
summary = {
    "task": "Task-00046",
    "description": "Throughput and GPU benchmarking on realistic long-form video",
    "run_timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "total_wall_time_sec": $ELAPSED,
    "mode": "$MODE",
}

face_report = os.path.join(results_dir, "face_benchmark", "benchmark_report.json")
if os.path.exists(face_report):
    with open(face_report) as f:
        fr = json.load(f)
    summary["face_pipeline"] = {
        "input_video": fr.get("input_video"),
        "duration_sec": fr.get("input_duration_sec"),
        "total_frames": fr.get("total_frames"),
        "fps_throughput": fr.get("fps_throughput"),
        "realtime_ratio": fr.get("realtime_ratio"),
        "tracks_found": fr.get("tracks_found"),
        "fallback_tracks_found": fr.get("fallback_tracks_found"),
        "gpu_name": fr.get("gpu_name"),
    }

cursor_json = os.path.join(results_dir, "cursor_benchmark", "cursor_track.json")
if os.path.exists(cursor_json):
    with open(cursor_json) as f:
        cr = json.load(f)
    summary["cursor_pipeline"] = {
        "input_video": cr.get("video"),
        "fps": cr.get("fps"),
        "resolution": cr.get("resolution"),
        "total_frames": cr.get("total_frames"),
        "detected_frames": cr.get("detected_frames"),
        "detection_rate": cr.get("detection_rate"),
    }

out_path = os.path.join(results_dir, "summary.json")
with open(out_path, "w") as f:
    json.dump(summary, f, indent=2)
print(f"  ✅ Summary written to: {out_path}")

# Pretty-print key metrics
print("")
print("╔══════════════════════════════════════════════════════════════════╗")
print("║                    TASK-00046 SUMMARY                            ║")
print("╠══════════════════════════════════════════════════════════════════╣")
if "face_pipeline" in summary:
    fp = summary["face_pipeline"]
    print(f"║  Face Pipeline                                                   ║")
    print(f"║    Video: {str(fp.get('input_video','—')):<55} ║")
    print(f"║    Duration:        {fp.get('duration_sec', 0)/60:.1f} min                                    ║")
    print(f"║    Throughput:      {fp.get('fps_throughput','—')} fps                                 ║")
    print(f"║    Realtime Ratio:  {fp.get('realtime_ratio','—')}x                                   ║")
    print(f"║    Tracks found:    {fp.get('tracks_found','—')} ({fp.get('fallback_tracks_found','—')} fallback)              ║")
    print("║                                                                  ║")
if "cursor_pipeline" in summary:
    cp = summary["cursor_pipeline"]
    print(f"║  Cursor Pipeline                                                 ║")
    print(f"║    Video: {str(cp.get('input_video','—')):<55} ║")
    print(f"║    Resolution:      {cp.get('resolution','—'):<45} ║")
    print(f"║    Detection rate:  {cp.get('detection_rate','—'):<45} ║")
print(f"║  Total wall time:   {$ELAPSED}s                                          ║")
print("╚══════════════════════════════════════════════════════════════════╝")
PYEOF

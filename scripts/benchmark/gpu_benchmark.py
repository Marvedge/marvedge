#!/usr/bin/env python3
"""
gpu_benchmark.py  (Task-00077 — v2: real pipeline execution)
─────────────────────────────────────────────────────────────────────────────
Wraps a real pipeline command with:
  • wall-clock timing
  • live nvidia-smi VRAM polling (100 ms cadence)
  • Cloud Run L4 GPU cost estimation  ($0.80 / hr)
  • JSON report output

Usage (local / Colab):
  python3 gpu_benchmark.py \
      --stage  avs \
      --cmd    "python preprocess_faces.py --videoPath clip.mp4 --savePath /tmp/out" \
      --out    avs_report.json
"""

import argparse, json, subprocess, sys, threading, time

# ── Pricing ──────────────────────────────────────────────────────────────────
#   Cloud Run GPU — NVIDIA L4 (24 GB GDDR6)
#   https://cloud.google.com/run/pricing  (as of 2025-Q3)
#   $0.000222 / vCPU-second  — approximate for T4/L4 GPU nodes
L4_COST_PER_SEC   = 0.80 / 3600   # $0.000222/s  (L4, billed per second)
T4_COST_PER_SEC   = 0.35 / 3600   # $0.000097/s  (T4, cheaper Colab default)


# ── GPU poller ────────────────────────────────────────────────────────────────
def _poll_gpu(stop: threading.Event, samples: list, interval: float = 0.1):
    """Background thread: poll nvidia-smi every `interval` seconds."""
    cmd = [
        "nvidia-smi",
        "--query-gpu=memory.used,memory.total,utilization.gpu,temperature.gpu",
        "--format=csv,noheader,nounits",
    ]
    while not stop.is_set():
        try:
            raw = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=2)
            parts = raw.decode().strip().split(",")
            if len(parts) >= 4:
                samples.append({
                    "mem_used_mib":  int(parts[0]),
                    "mem_total_mib": int(parts[1]),
                    "gpu_util_pct":  int(parts[2]),
                    "temp_c":        int(parts[3]),
                })
        except Exception:
            pass   # no GPU or nvidia-smi not available
        stop.wait(interval)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="GPU Pipeline Benchmark Harness (Task-00077)")
    ap.add_argument("--stage",    required=True,  help="Pipeline stage name (reframe|avs|dub)")
    ap.add_argument("--cmd",      required=True,  help="Shell command to time")
    ap.add_argument("--out",      required=True,  help="Path to write JSON report")
    ap.add_argument("--gpu-type", default="L4",   help="GPU type for cost calc: L4 or T4 (default: L4)")
    ap.add_argument("--video-sec",type=float,     help="Source video length in seconds (for x-real-time calc)")
    args = ap.parse_args()

    cost_per_sec = T4_COST_PER_SEC if args.gpu_type.upper() == "T4" else L4_COST_PER_SEC

    print(f"\n{'═'*60}")
    print(f"  BENCHMARK  |  stage={args.stage}  |  gpu={args.gpu_type}")
    print(f"  cmd: {args.cmd}")
    print(f"{'═'*60}\n")

    samples: list = []
    stop_evt = threading.Event()
    poller = threading.Thread(target=_poll_gpu, args=(stop_evt, samples, 0.1), daemon=True)
    poller.start()

    t0 = time.perf_counter()
    try:
        proc = subprocess.run(args.cmd, shell=True, stdout=sys.stdout, stderr=sys.stderr)
        success = proc.returncode == 0
    except Exception as exc:
        print(f"[BENCHMARK] FAILED: {exc}", file=sys.stderr)
        success = False
    t1 = time.perf_counter()

    stop_evt.set()
    poller.join()

    duration = t1 - t0
    cost_usd  = duration * cost_per_sec

    # Aggregate GPU samples
    max_mem_mib  = max((s["mem_used_mib"]  for s in samples), default=0)
    max_util_pct = max((s["gpu_util_pct"]  for s in samples), default=0)
    avg_util_pct = (sum(s["gpu_util_pct"] for s in samples) / len(samples)) if samples else 0
    mem_total    = samples[0]["mem_total_mib"] if samples else 0
    max_temp_c   = max((s["temp_c"]         for s in samples), default=0)

    # Real-time factor  (how many seconds of video per second of compute)
    xrt = (args.video_sec / duration) if args.video_sec and duration > 0 else None

    report = {
        "stage":               args.stage,
        "gpu_type":            args.gpu_type,
        "success":             success,
        "duration_seconds":    round(duration, 3),
        "max_vram_used_mib":   max_mem_mib,
        "vram_total_mib":      mem_total,
        "vram_utilization_pct": round(max_mem_mib / mem_total * 100, 1) if mem_total else 0,
        "max_gpu_util_pct":    max_util_pct,
        "avg_gpu_util_pct":    round(avg_util_pct, 1),
        "max_temp_c":          max_temp_c,
        "gpu_poll_samples":    len(samples),
        "estimated_cost_usd":  round(cost_usd, 6),
        "cost_per_min_usd":    round(cost_per_sec * 60, 6),
        "realtime_factor":     round(xrt, 3) if xrt else None,
    }

    # ── Pretty print ──────────────────────────────────────────────────────────
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"\n{'─'*60}")
    print(f"  RESULTS: {args.stage.upper():10s}  {status}")
    print(f"{'─'*60}")
    print(f"  Duration          : {duration:.2f}s")
    if xrt:
        print(f"  Real-time factor  : {xrt:.2f}x  ({xrt:.2f}s video / s compute)")
    print(f"  Max VRAM          : {max_mem_mib} MiB / {mem_total} MiB  ({report['vram_utilization_pct']}%)")
    print(f"  GPU Utilization   : peak={max_util_pct}%  avg={avg_util_pct:.1f}%")
    print(f"  Max GPU temp      : {max_temp_c}°C")
    print(f"  Est. cost ({args.gpu_type})   : ${cost_usd:.6f}  (${cost_per_sec*60:.4f}/min)")
    print(f"{'─'*60}\n")

    with open(args.out, "w") as f:
        json.dump(report, f, indent=2)
    print(f"  Report → {args.out}\n")


if __name__ == "__main__":
    main()

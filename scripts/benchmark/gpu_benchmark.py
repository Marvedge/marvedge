#!/usr/bin/env python3
"""
gpu_benchmark.py
Benchmarking harness for tracking GPU throughput, memory footprint, and estimated
costs across the AI pipeline stages (reframe, active speaker detection, dubbing).

Usage:
  python3 gpu_benchmark.py --stage [reframe|avs|dub] --cmd "python my_script.py" --out report.json
"""

import argparse
import subprocess
import time
import json
import threading
import sys

# Cloud Run L4 GPU pricing (approximate, per second)
L4_COST_PER_SEC = 0.80 / 3600  # $0.00022/s

def get_gpu_memory():
    """Poll nvidia-smi for current memory usage of the first GPU. Returns MiB."""
    try:
        res = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            stderr=subprocess.DEVNULL
        )
        return int(res.decode().strip())
    except Exception:
        # If no GPU or nvidia-smi fails, return 0
        return 0

def monitor_gpu(stop_event, stats):
    """Background thread to poll GPU stats."""
    while not stop_event.is_set():
        mem = get_gpu_memory()
        stats['memory_samples'].append(mem)
        stats['max_memory'] = max(stats['max_memory'], mem)
        time.sleep(0.5)

def main():
    parser = argparse.ArgumentParser(description="GPU Pipeline Benchmark")
    parser.add_argument("--stage", type=str, required=True, help="Name of pipeline stage")
    parser.add_argument("--cmd", type=str, required=True, help="Command to run")
    parser.add_argument("--out", type=str, required=True, help="JSON output file")
    args = parser.parse_args()

    print(f"[BENCHMARK] Starting {args.stage}...")
    print(f"[BENCHMARK] Command: {args.cmd}")

    stats = {
        "stage": args.stage,
        "max_memory": 0,
        "memory_samples": [],
    }

    stop_event = threading.Event()
    t = threading.Thread(target=monitor_gpu, args=(stop_event, stats))
    t.start()

    start_time = time.time()
    
    # Run the target command
    try:
        proc = subprocess.run(
            args.cmd, 
            shell=True, 
            stdout=sys.stdout, 
            stderr=sys.stderr
        )
        success = (proc.returncode == 0)
    except Exception as e:
        print(f"[BENCHMARK] Failed to run: {e}")
        success = False

    end_time = time.time()
    stop_event.set()
    t.join()

    duration = end_time - start_time
    cost = duration * L4_COST_PER_SEC

    report = {
        "stage": args.stage,
        "duration_seconds": round(duration, 3),
        "success": success,
        "max_vram_mib": stats['max_memory'],
        "estimated_cost_usd": round(cost, 6),
    }

    print("\n" + "="*50)
    print(f"BENCHMARK RESULTS: {args.stage}")
    print("="*50)
    for k, v in report.items():
        print(f"{k}: {v}")
    
    with open(args.out, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"\n[BENCHMARK] Report saved to {args.out}")

if __name__ == "__main__":
    main()

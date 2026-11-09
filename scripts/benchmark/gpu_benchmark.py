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

import argparse, json, math, os, shutil, subprocess, sys, threading, time
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
def resolve_shell_executable() -> str:
    """Return a POSIX-compatible shell that can run the benchmark_runner.sh command strings.

    The benchmark runner emits bash-compatible commands (e.g. ``$VAR`` expansion,
    single-quoted arguments to ffmpeg, ``python3`` invocations).  On Windows we
    prefer a real bash executable from Git Bash or WSL.

    Candidate selection rules
    -------------------------
    * ``$BASH`` and ``$SHELL`` env-vars are only trusted when their *basename*
      (without extension) is ``bash`` or ``sh``.  Accepting an arbitrary path
      merely because it exists on disk would allow any executable injected via
      the environment to be treated as a POSIX shell.
    * Fixed names ``bash``, ``/bin/bash``, ``sh``, ``/bin/sh`` are always tried
      via ``shutil.which`` / existence checks.

    Raises
    ------
    RuntimeError
        When no POSIX-compatible shell (bash or sh) is found.
        On Windows, falling back to cmd.exe would silently misinterpret the
        runner's POSIX syntax and produce misleading benchmark results, so we
        fail explicitly with a clear error instead.
    """
    # Known POSIX-compatible basenames (lowercase, without extension).
    _POSIX_BASENAMES = frozenset({"bash", "sh"})

    posix_candidates: list[str] = []

    # Trust env-var hints only when the basename is a known POSIX shell.
    for env_name in ("BASH", "SHELL"):
        value = os.environ.get(env_name)
        if value:
            base = os.path.splitext(os.path.basename(value))[0].lower()
            if base in _POSIX_BASENAMES:
                posix_candidates.append(value)

    if os.name == "nt":
        for p in (
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files\Git\usr\bin\bash.exe",
        ):
            if os.path.exists(p):
                posix_candidates.append(p)

    # Always probe well-known fixed paths / names via PATH.
    for raw in ("bash", "/bin/bash", "sh", "/bin/sh"):
        if shutil.which(raw):
            posix_candidates.append(raw)

    seen: set[str] = set()
    for candidate in posix_candidates:
        normalized = os.path.expandvars(candidate)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        if os.path.exists(normalized) or shutil.which(normalized):
            return normalized

    # No POSIX shell found.
    if os.name == "nt":
        raise RuntimeError(
            "No POSIX-compatible shell (bash or sh) was found on this Windows machine.\n"
            "The benchmark runner emits bash-compatible commands ($VAR expansion,\n"
            "single-quoted arguments) that cmd.exe cannot interpret correctly.\n"
            "Install Git for Windows (which provides bash.exe) or run under WSL."
        )

    # On non-Windows systems a POSIX shell must be present; if we reach here
    # something is very wrong with the PATH.
    raise RuntimeError(
        "No POSIX-compatible shell (bash or sh) found on PATH. "
        "Ensure /bin/bash or /bin/sh is available."
    )


def main():
    ap = argparse.ArgumentParser(description="GPU Pipeline Benchmark Harness (Task-00077)")
    ap.add_argument("--stage",    required=True,  help="Pipeline stage name (reframe|avs|dub)")
    ap.add_argument("--cmd",      required=True,  help="Shell command to time")
    ap.add_argument("--out",      required=True,  help="Path to write JSON report")
    ap.add_argument("--gpu-type", default="L4",   help="GPU type for cost calc: L4 or T4 (default: L4)")
    ap.add_argument("--video-sec",type=float,     help="Source video length in seconds (for x-real-time calc)")
    args = ap.parse_args()

    if args.video_sec is not None and (
        not math.isfinite(args.video_sec) or args.video_sec < 0
    ):
        ap.error("--video-sec must be a finite, non-negative number")

    cost_per_sec = T4_COST_PER_SEC if args.gpu_type.upper() == "T4" else L4_COST_PER_SEC
    shell_executable = resolve_shell_executable()

    print(f"\n{'='*60}")
    print(f"  BENCHMARK  |  stage={args.stage}  |  gpu={args.gpu_type}")
    print(f"  cmd: {args.cmd}")
    print(f"{'='*60}\n")

    samples: list = []
    stop_evt = threading.Event()
    poller = threading.Thread(target=_poll_gpu, args=(stop_evt, samples, 0.1), daemon=True)
    poller.start()

    t0 = time.perf_counter()
    proc_rc = 0
    try:
        if os.name == "nt":
            # On Windows, subprocess.run(..., shell=True, executable=...) passes '/c'
            # (cmd.exe style) rather than '-c' (POSIX style), causing bash to treat
            # '/c' as a script path (which fails with exit code 126: /c is a directory).
            # When the resolved shell is a POSIX shell (bash or sh), invoke it directly with -c.
            base_shell = os.path.splitext(os.path.basename(shell_executable))[0].lower()
            if base_shell in {"bash", "sh"}:
                proc = subprocess.run(
                    [shell_executable, "-c", args.cmd],
                    stdout=sys.stdout,
                    stderr=sys.stderr,
                )
            else:
                proc = subprocess.run(
                    args.cmd,
                    shell=True,
                    executable=shell_executable,
                    stdout=sys.stdout,
                    stderr=sys.stderr,
                )
        else:
            proc = subprocess.run(
                args.cmd,
                shell=True,
                executable=shell_executable,
                stdout=sys.stdout,
                stderr=sys.stderr,
            )
        proc_rc = proc.returncode
        success = proc.returncode == 0
    except Exception as exc:
        print(f"[BENCHMARK] FAILED: {exc}", file=sys.stderr)
        success = False
        proc_rc = 1
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
        "exit_code":           proc_rc,
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
    status = "PASS" if success else "FAIL"
    print(f"\n{'-'*60}")
    print(f"  RESULTS: {args.stage.upper():10s}  {status}")
    print(f"{'-'*60}")
    print(f"  Duration          : {duration:.2f}s")
    if xrt:
        print(f"  Real-time factor  : {xrt:.2f}x  ({xrt:.2f}s video / s compute)")
    print(f"  Max VRAM          : {max_mem_mib} MiB / {mem_total} MiB  ({report['vram_utilization_pct']}%)")
    print(f"  GPU Utilization   : peak={max_util_pct}%  avg={avg_util_pct:.1f}%")
    print(f"  Max GPU temp      : {max_temp_c}C")
    print(f"  Est. cost ({args.gpu_type})   : ${cost_usd:.6f}  (${cost_per_sec*60:.4f}/min)")
    print(f"{'-'*60}\n")

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, allow_nan=False)
        print(f"  Report -> {args.out}\n")
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())

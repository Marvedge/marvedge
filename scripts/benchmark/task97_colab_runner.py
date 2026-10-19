"""
task97_colab_runner.py
======================
Google Colab runner for Task-00097 ship-readiness validation.

Paste this entire file into a Colab code cell, or upload it and run:
    !python task97_colab_runner.py --videoPath /content/your_video.mp4

STEPS:
  1. Upload your test video to /content/ via Colab Files panel (or mount Drive)
  2. Run this cell — it installs deps, downloads models, runs pipeline, prints gate report
  3. Download task97_gate_report.json from /tmp/task97_validation/pywork/

WHAT THIS RUNNER DOES:
  - Installs FFmpeg, OpenCV, scipy, torch automatically
  - Downloads YuNet ONNX face detector (CPU-based, frees GPU for TalkNet)
  - Runs full V4 pipeline: I-frame decode → detect → interpolate → track → crop
  - Evaluates 16 ship-readiness gates against AUTOFLIP_TALKNET_SHIP_READINESS_CRITERIA.md
  - Writes JSON report with per-gate PASS/FAIL/SKIP results
  - Works on videos up to 60 minutes (T4/L4 GPU runtime)

EXPECTED RESULTS FOR A 60-MINUTE VIDEO (extrapolated from benchmark):
  - S2+S3 detection:   ~130 s  (I-frame only — only ~1200 keyframes out of 108000 frames)
  - S6 crop:           ~90 s
  - Total wall-clock:  ~250 s  (~14× real-time)
"""

# ─── Step 0: Install dependencies ────────────────────────────────────────────

import subprocess, sys, os

def install():
    pkgs = [
        "numpy==1.23.5",
        "scipy==1.10.1",
        "opencv-python-headless>=4.5.5",
        "python_speech_features>=0.6",
        "tqdm>=4.60.0",
        "requests>=2.28.0",
    ]
    print("Installing Python packages...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q"] + pkgs)

    # FFmpeg
    if not os.path.exists("/usr/bin/ffmpeg"):
        print("Installing ffmpeg...")
        subprocess.run(["apt-get", "install", "-y", "-q", "ffmpeg"], check=False)

    import cv2, scipy, numpy
    print(f"  numpy  {numpy.__version__}")
    print(f"  opencv {cv2.__version__}")
    print(f"  scipy  {scipy.__version__}")
    try:
        import torch
        print(f"  torch  {torch.__version__}  cuda={torch.cuda.is_available()}")
    except ImportError:
        # Optional: PyTorch not installed (TalkNet gates will be skipped)
        pass
    print("Setup complete.")

install()

# ─── Step 1: Import the full validation script ───────────────────────────────

# If running from Colab, the script lives in the same dir or can be fetched
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Add the marvedge repo root to path if running from inside the repo
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from task97_ship_readiness_colab import run_full_validation

# ─── Step 2: Configure your video path ───────────────────────────────────────

# !! CHANGE THIS to your uploaded video path !!
VIDEO_PATH  = os.environ.get("TASK97_VIDEO", "/content/test_video.mp4")
OUTPUT_DIR  = "/tmp/task97_validation"
MODEL_DIR   = "/tmp/task97_models"

# Optimisation settings (match benchmark defaults)
DET_SCALE   = 0.25   # Detect at 25% resolution → 37× fewer pixels
CROP_SCALE  = 0.40   # Expand face bbox by 2.5× for natural crop
MIN_TRACK   = 10     # Minimum 10 frames to count as a valid track
THREADS     = 4      # FFmpeg CPU threads

# ─── Step 3: Run the full validation ─────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--videoPath", default=VIDEO_PATH)
    p.add_argument("--outputDir", default=OUTPUT_DIR)
    p.add_argument("--modelDir",  default=MODEL_DIR)
    p.add_argument("--detScale",  type=float, default=DET_SCALE)
    p.add_argument("--cropScale", type=float, default=CROP_SCALE)
    p.add_argument("--minTrack",  type=int,   default=MIN_TRACK)
    p.add_argument("--threads",   type=int,   default=THREADS)
    p.add_argument("--repoRoot",  default=REPO_ROOT)
    args = p.parse_args()

    if not os.path.isfile(args.videoPath):
        print(f"\n[ERROR] Video not found: {args.videoPath}")
        print("  Upload your test video to /content/ and set --videoPath accordingly.")
        print("  Example: python task97_colab_runner.py --videoPath /content/my_video.mp4\n")
        sys.exit(1)

    report = run_full_validation(
        video_path  = args.videoPath,
        output_dir  = args.outputDir,
        model_dir   = args.modelDir,
        det_scale   = args.detScale,
        crop_scale  = args.cropScale,
        min_track   = args.minTrack,
        threads     = args.threads,
        repo_root   = args.repoRoot,
    )

    # Print summary for Colab output
    print("\n" + "=" * 60)
    print(f"  VERDICT  : {report['verdict']}")
    print(f"  Blockers : {report['blockers']}")
    print(f"  Report   : {args.outputDir}/pywork/task97_gate_report.json")
    print("=" * 60)

    # ── Quick copy of report to /content for easy download ─────────────────
    import shutil
    dest = "/content/task97_gate_report.json"
    src  = os.path.join(args.outputDir, "pywork", "task97_gate_report.json")
    if os.path.exists(src):
        shutil.copy(src, dest)
        print(f"  📥 Download report from: {dest}")

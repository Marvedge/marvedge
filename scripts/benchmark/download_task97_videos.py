import os
import subprocess
import json

VIDEOS = [
    ("vid01_8MUfv497OSA", "https://www.youtube.com/watch?v=8MUfv497OSA"),
    ("vid02_xAt1xcC6qfM", "https://www.youtube.com/watch?v=xAt1xcC6qfM"),
    ("vid03_OqpuFFAWYhk", "https://www.youtube.com/watch?v=OqpuFFAWYhk"),
    ("vid04_A4SD6pkfKcY", "https://www.youtube.com/watch?v=A4SD6pkfKcY"),
    ("vid05_gGk_jOyhL5U", "https://www.youtube.com/watch?v=gGk_jOyhL5U"),
    ("vid06_LhpZJwUboeI", "https://www.youtube.com/watch?v=LhpZJwUboeI"),
    ("vid07_IEfBBYmxtIo", "https://www.youtube.com/watch?v=IEfBBYmxtIo"),
    ("vid08_pwcdw0t_tCo", "https://www.youtube.com/watch?v=pwcdw0t-tCo"),
]

OUT_DIR = "/Users/aadityaagarwal/Downloads/marvedge/demo/task97_videos"
os.makedirs(OUT_DIR, exist_ok=True)

print(f"Downloading {len(VIDEOS)} videos to {OUT_DIR}...")

for label, url in VIDEOS:
    out_pattern = os.path.join(OUT_DIR, f"{label}_%(title).50s.%(ext)s")
    print(f"\n========================================\nDownloading: {label} ({url})\n========================================")
    
    # 480p/720p format for optimal quality & fast testing
    fmt = "bestvideo[height<=720]+bestaudio/best[height<=720]/best"
    cmd = [
        "/Users/aadityaagarwal/Downloads/marvedge/venv/bin/yt-dlp",
        "--no-playlist",
        "--merge-output-format", "mp4",
        "--format", fmt,
        "--output", out_pattern,
        url
    ]
    res = subprocess.run(cmd)
    if res.returncode != 0:
        print(f"Fallback format for {url}...")
        cmd_fb = [
            "/Users/aadityaagarwal/Downloads/marvedge/venv/bin/yt-dlp",
            "--no-playlist",
            "--merge-output-format", "mp4",
            "--format", "best",
            "--output", out_pattern,
            url
        ]
        subprocess.run(cmd_fb)

print("\n--- Download complete! Listing files: ---")
for f in sorted(os.listdir(OUT_DIR)):
    p = os.path.join(OUT_DIR, f)
    sz = os.path.getsize(p) / (1024 * 1024)
    print(f"  {f} ({sz:.2f} MB)")

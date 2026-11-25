import os
import sys
import json
import hashlib
import shutil
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEMO_ROOT = os.path.join(ROOT, "investor-demo")
ASSETS_DIR = os.path.join(DEMO_ROOT, "demo-assets")
BACKUP_DIR = os.path.join(DEMO_ROOT, "final-mp4-backup")

def regenerate_manifests():
    final_mp4s = [
        "source_landscape_16x9.mp4",
        "demo1_intelligent_reframe_9x16.mp4",
        "demo2_kinetic_karaoke_9x16.mp4",
        "demo3_multilingual_research_preview_9x16.mp4",
        "demo4_side_by_side_transformation_16x9.mp4",
        "marvedge_investor_walkthrough_master_backup.mp4",
        "marvedge_investor_demo_narrated.mp4",
    ]
    manifest = []
    sha_lines = []
    for fname in final_mp4s:
        p_main = os.path.join(ASSETS_DIR, fname)
        p_bak = os.path.join(BACKUP_DIR, fname)
        if not os.path.exists(p_main):
            continue
        h_main = hashlib.sha256(open(p_main, "rb").read()).hexdigest()
        h_bak = hashlib.sha256(open(p_bak, "rb").read()).hexdigest()
        assert h_main == h_bak, f"Backup parity mismatch on {fname}"
        sha_lines.append(f"{h_main}  demo-assets/{fname}")
        sha_lines.append(f"{h_bak}  final-mp4-backup/{fname}")
        manifest.append({
            "file": fname,
            "sha256": h_main,
            "size_bytes": os.path.getsize(p_main),
            "backup_verified": True,
        })
    with open(os.path.join(DEMO_ROOT, "SHA256SUMS.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(sha_lines) + "\n")
    with open(os.path.join(ASSETS_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"deliverables": manifest}, f, indent=2)
    print("[Manifest] Updated SHA256SUMS.txt and demo-assets/manifest.json")

def remux_voiceover(vo_path):
    if not os.path.exists(vo_path):
        raise FileNotFoundError(f"Human voiceover file not found: {vo_path}")

    # 1. Remux 16.0s clips (Demo 2 and Demo 4)
    targets_16s = [
        "demo2_kinetic_karaoke_9x16.mp4",
        "demo4_side_by_side_transformation_16x9.mp4",
    ]

    for fname in targets_16s:
        in_mp4 = os.path.join(ASSETS_DIR, fname)
        tmp_mp4 = os.path.join(ASSETS_DIR, f"_vo_{fname}")
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", in_mp4,
            "-i", vo_path,
            "-filter_complex",
            "[0:a]volume=0.18[bg];[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:16,asetpts=PTS-STARTPTS,volume=1.0[vo];[bg][vo]amix=inputs=2:duration=first:dropout_transition=0[a]",
            "-map", "0:v", "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            tmp_mp4,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg remux failed for {fname}:\n{res.stderr}")
        shutil.move(tmp_mp4, in_mp4)
        shutil.copy2(in_mp4, os.path.join(BACKUP_DIR, fname))
        print(f"[Remuxed 16s] {fname} + copied to final-mp4-backup/")

    # 2. Remux 100.0s marvedge_investor_demo_narrated.mp4 (injecting 16s VO at Chapter 2 [34.0s] and Chapter 4 [74.0s])
    narrated_mp4 = os.path.join(ASSETS_DIR, "marvedge_investor_demo_narrated.mp4")
    if os.path.exists(narrated_mp4):
        tmp_narrated = os.path.join(ASSETS_DIR, "_vo_marvedge_investor_demo_narrated.mp4")
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", narrated_mp4,
            "-i", vo_path,
            "-filter_complex",
            "[0:a]volume=0.18[bg];"
            "[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:16,asetpts=PTS-STARTPTS,asplit=2[vo1][vo2];"
            "[vo1]adelay=34000|34000[d1];"
            "[vo2]adelay=74000|74000[d2];"
            "[bg][d1][d2]amix=inputs=3:duration=first:dropout_transition=0:normalize=0[a]",
            "-map", "0:v", "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            tmp_narrated,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg remux failed for marvedge_investor_demo_narrated.mp4:\n{res.stderr}")
        shutil.move(tmp_narrated, narrated_mp4)
        shutil.copy2(narrated_mp4, os.path.join(BACKUP_DIR, "marvedge_investor_demo_narrated.mp4"))
        print("[Remuxed 100s] marvedge_investor_demo_narrated.mp4 (Chapters 2 & 4 synced) + copied to final-mp4-backup/")

    # Save voiceover copy and regenerate SHA-256 manifests
    dest_vo = os.path.join(ASSETS_DIR, "human_voiceover_en.wav")
    if os.path.abspath(vo_path) != os.path.abspath(dest_vo):
        shutil.copy2(vo_path, dest_vo)
        print(f"[Saved] {dest_vo}")

    regenerate_manifests()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/remuxHumanVoiceover.py <path_to_human_voiceover_en.wav>")
        sys.exit(1)
    remux_voiceover(os.path.abspath(sys.argv[1]))

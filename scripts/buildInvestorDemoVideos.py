import os
import sys
import shutil
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_DIR = os.path.join(ROOT, "investor-demo", "demo-assets")
BACKUP_DIR = os.path.join(ROOT, "investor-demo", "final-mp4-backup")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)

CLIP1_16X9 = os.path.join(ROOT, "public", "icons", "1.mp4")
CLIP2_16X9 = os.path.join(ROOT, "public", "icons", "2.mp4")
AUTOFLIP_9X16 = os.path.join(ROOT, "public", "icons", "autoflip_1_pr354_9x16.mp4")

def run_ffmpeg(args, desc):
    print(f"[FFmpeg] {desc}...")
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"] + args
    res = subprocess.run(cmd, cwd=OUT_DIR, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg failed on {desc}:\n{res.stderr}")

def write_ass_with_banner(base_ass_path, out_ass_path, banners):
    with open(base_ass_path, "r", encoding="utf-8") as f:
        content = f.read()
    style_addition = (
        "Style: TopBadge,Arial,23,&H00FFFFFF,&H00FFFFFF,&H001E1B4B,&HB40F172A,-1,0,0,0,100,100,0.3,0,3,8,0,8,20,20,36,1\n"
        "Style: SubBadge,Arial,18,&H00A5B4FC,&H00A5B4FC,&H000F172A,&HB40F172A,0,0,0,0,100,100,0.2,0,3,6,0,8,20,20,82,1\n"
    )
    content = content.replace("[Events]", style_addition + "\n[Events]")
    for start, end, style, text in banners:
        content += f"\nDialogue: 1,{start},{end},{style},,0,0,0,,{text}"
    with open(out_ass_path, "w", encoding="utf-8") as f:
        f.write(content + "\n")

def write_reframe_ass(out_ass_path):
    ass = """[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: TopBadge,Arial,24,&H00FFFFFF,&H00FFFFFF,&H001E1B4B,&HB40F172A,-1,0,0,0,100,100,0.4,0,3,8,0,8,24,24,36,1
Style: SubBadge,Arial,19,&H006EE7B7,&H006EE7B7,&H000F172A,&HB40F172A,-1,0,0,0,100,100,0.2,0,3,6,0,8,24,24,82,1
Style: BottomNote,Arial,20,&H00E2E8F0,&H00E2E8F0,&H000F172A,&HB40F172A,0,0,0,0,100,100,0.2,0,3,6,0,2,24,24,52,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,0:00:00.00,0:00:08.00,TopBadge,,0,0,0,,DEMO 1A: AUTOFLIP SALIENCY CROP (16:9 -> 9:16)
Dialogue: 1,0:00:00.00,0:00:08.00,SubBadge,,0,0,0,,Tracks primary visual subject automatically in portrait
Dialogue: 1,0:00:00.00,0:00:08.00,BottomNote,,0,0,0,,Source: Owned Marvedge 3D Animation (1280x720 -> 720x1280)
Dialogue: 1,0:00:08.00,0:00:16.00,TopBadge,,0,0,0,,DEMO 1B: BLUR-PAD CONTEXT FIT (16:9 -> 9:16)
Dialogue: 1,0:00:08.00,0:00:16.00,SubBadge,,0,0,0,,Preserves 100% horizontal frame with ambient blur canvas
Dialogue: 1,0:00:08.00,0:00:16.00,BottomNote,,0,0,0,,Deterministic FFmpeg build9x16FitFilter Pipeline
"""
    with open(out_ass_path, "w", encoding="utf-8") as f:
        f.write(ass)

def build_widescreen_chapter(portrait_mp4, source_16x9, out_mp4, chapter_ass_name, chapter_title, chapter_subtitle, chapter_notes):
    ass_path = os.path.join(OUT_DIR, chapter_ass_name)
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ChapterTop,Arial,32,&H00FFFFFF,&H00FFFFFF,&H001E1B4B,&HC80F172A,-1,0,0,0,100,100,0.6,0,3,10,0,7,70,40,36,1
Style: ChapterSub,Arial,22,&H00A5B4FC,&H00A5B4FC,&H000F172A,&HC80F172A,-1,0,0,0,100,100,0.3,0,3,8,0,7,70,40,86,1
Style: LeftHead,Arial,22,&H0094A3B8,&H0094A3B8,&H000F172A,&HB40F172A,-1,0,0,0,100,100,0.3,0,3,6,0,7,70,0,175,1
Style: RightHead,Arial,22,&H006EE7B7,&H006EE7B7,&H000F172A,&HB40F172A,-1,0,0,0,100,100,0.3,0,3,6,0,9,0,190,95,1
Style: CueBar,Arial,23,&H0000EAFF,&H00FFFFFF,&H000F172A,&HC80F172A,-1,0,0,0,100,100,0.3,0,3,8,0,1,70,700,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,0:00:00.00,0:00:16.00,ChapterTop,,0,0,0,,{chapter_title}
Dialogue: 1,0:00:00.00,0:00:16.00,ChapterSub,,0,0,0,,{chapter_subtitle}
Dialogue: 1,0:00:00.00,0:00:16.00,LeftHead,,0,0,0,,INPUT: 16:9 DESKTOP SOURCE (1280x720)
Dialogue: 1,0:00:00.00,0:00:16.00,RightHead,,0,0,0,,OUTPUT: 9:16 VERTICAL PORTRAIT (720x1280)
Dialogue: 1,0:00:00.00,0:00:08.00,CueBar,,0,0,0,,{chapter_notes[0]}
Dialogue: 1,0:00:08.00,0:00:16.00,CueBar,,0,0,0,,{chapter_notes[1]}
""")
    run_ffmpeg(
        [
            "-f", "lavfi", "-i", "color=c=#0B0F19:s=1920x1080:r=24:d=16",
            "-i", source_16x9,
            "-i", portrait_mp4,
            "-filter_complex",
            "[1:v]scale=960:540:flags=lanczos,pad=968:548:4:4:color=#334155[left];"
            "[2:v]scale=495:880:flags=lanczos,pad=503:888:4:4:color=#6366F1[right];"
            f"[0:v][left]overlay=70:225[bg1];"
            f"[bg1][right]overlay=1240:135,subtitles={chapter_ass_name},format=yuv420p[v]",
            "-map", "[v]", "-map", "1:a",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            out_mp4,
        ],
        f"Building widescreen chapter {os.path.basename(out_mp4)}"
    )

def main():
    only_d2_d4 = "--only-demo2-demo4" in sys.argv
    source_16x9 = os.path.join(OUT_DIR, "source_landscape_16x9.mp4")
    if not only_d2_d4:
        # 0. Build 16.0s landscape source reference (1280x720, 24fps)
        run_ffmpeg(
            [
                "-i", CLIP1_16X9,
                "-i", CLIP2_16X9,
                "-filter_complex",
                "[0:v]scale=1280:720,fps=24,format=yuv420p[v0];"
                "[1:v]scale=1280:720,fps=24,format=yuv420p[v1];"
                "[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:8,asetpts=PTS-STARTPTS[a0];"
                "[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:8,asetpts=PTS-STARTPTS[a1];"
                "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]",
                "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                source_16x9,
            ],
            "Building 16.0s landscape source (source_landscape_16x9.mp4)"
        )

    # 1. Build clean 9:16 base video (720x1280, 16.0s)
    base_9x16 = os.path.join(OUT_DIR, "_base_reframed_9x16.mp4")
    run_ffmpeg(
        [
            "-i", AUTOFLIP_9X16,
            "-i", CLIP2_16X9,
            "-filter_complex",
            "[0:v]trim=0:8,setpts=PTS-STARTPTS,scale=720:1280:flags=lanczos,fps=24,format=yuv420p[v0];"
            "[1:v]trim=0:8,setpts=PTS-STARTPTS,fps=24,split=2[fg_raw][bg_raw];"
            "[bg_raw]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=24:6,eq=brightness=-0.12:saturation=1.15[bg];"
            "[fg_raw]scale=720:-2:force_original_aspect_ratio=decrease[fg];"
            "[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v1];"
            "[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:8,asetpts=PTS-STARTPTS[a0];"
            "[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:8,asetpts=PTS-STARTPTS[a1];"
            "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]",
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            base_9x16,
        ],
        "Building 16.0s 9:16 reframed base (_base_reframed_9x16.mp4)"
    )

    demo1_mp4 = os.path.join(OUT_DIR, "demo1_intelligent_reframe_9x16.mp4")
    if not only_d2_d4:
        # 2. Render Demo 1: Intelligent Landscape-to-Portrait Reframing
        demo1_ass = os.path.join(OUT_DIR, "demo1_reframe_overlay.ass")
        write_reframe_ass(demo1_ass)
        run_ffmpeg(
            [
                "-i", base_9x16,
                "-vf", "subtitles=demo1_reframe_overlay.ass",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                "-c:a", "copy",
                demo1_mp4,
            ],
            "Rendering Demo 1: Intelligent Reframing (demo1_intelligent_reframe_9x16.mp4)"
        )

    # 3. Render Demo 2: Kinetic Product Callouts & Timed Cues (Honest Pre-Voiceover Labeling)
    demo2_RichAss = os.path.join(OUT_DIR, "demo2_kinetic_karaoke_badged.ass")
    write_ass_with_banner(
        os.path.join(OUT_DIR, "demo2_kinetic_karaoke.ass"),
        demo2_RichAss,
        [
            ("0:00:00.00", "0:00:16.00", "TopBadge", "DEMO 2: KINETIC PRODUCT CALLOUTS (\\k ASS TAGS)"),
            ("0:00:00.00", "0:00:16.00", "SubBadge", "Timed Product Callouts (Ambient Audio — Ready for Human VO)"),
        ],
    )
    demo2_mp4 = os.path.join(OUT_DIR, "demo2_kinetic_karaoke_9x16.mp4")
    run_ffmpeg(
        [
            "-i", base_9x16,
            "-vf", "subtitles=demo2_kinetic_karaoke_badged.ass",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "copy",
            demo2_mp4,
        ],
        "Rendering Demo 2: Kinetic Product Callouts (demo2_kinetic_karaoke_9x16.mp4)"
    )

    demo3_mp4 = os.path.join(OUT_DIR, "demo3_multilingual_research_preview_9x16.mp4")
    if not only_d2_d4:
        # 4. Render Demo 3: Multilingual Concept / Research Preview (Explicitly Disclaims Dubbed Audio)
        demo3_RichAss = os.path.join(OUT_DIR, "demo3_multilingual_preview_badged.ass")
        write_ass_with_banner(
            os.path.join(OUT_DIR, "demo3_multilingual_preview.ass"),
            demo3_RichAss,
            [
                ("0:00:00.00", "0:00:16.00", "TopBadge", "CONCEPT / RESEARCH PREVIEW: MULTILINGUAL CAPTIONS"),
                ("0:00:00.30", "0:00:04.80", "SubBadge", "[EN] Caption Window Preview (Ambient Audio — No Dubbed Speech)"),
                ("0:00:05.30", "0:00:10.30", "SubBadge", "[ES] Caption Window Preview (Ambient Audio — No Dubbed Speech)"),
                ("0:00:10.80", "0:00:15.80", "SubBadge", "[FR] Caption Window Preview (Ambient Audio — No Dubbed Speech)"),
            ],
        )
        run_ffmpeg(
            [
                "-i", base_9x16,
                "-vf", "subtitles=demo3_multilingual_preview_badged.ass",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                "-c:a", "copy",
                demo3_mp4,
            ],
            "Rendering Demo 3: Multilingual Concept / Research Preview (demo3_multilingual_research_preview_9x16.mp4)"
        )

    # 5. Render Demo 4: Side-by-Side Before & After Transformation (1920x1080)
    demo4_mp4 = os.path.join(OUT_DIR, "demo4_side_by_side_transformation_16x9.mp4")
    build_widescreen_chapter(
        demo2_mp4,
        source_16x9,
        demo4_mp4,
        "demo4_sbs_labels.ass",
        "DEMO 4: SIDE-BY-SIDE BEFORE & AFTER TRANSFORMATION",
        "Synchronized Frame-for-Frame Comparison: 16:9 Source vs. 9:16 Reframed + Kinetic Callouts",
        [
            "Phase 1 (0-8s): AutoFlip Saliency Crop + Timed Kinetic Product Callouts",
            "Phase 2 (8-16s): Blur-Pad Context Fit + Timed Kinetic Product Callouts",
        ],
    )

    if only_d2_d4:
        if os.path.exists(base_9x16):
            os.remove(base_9x16)
        for fname in ["demo2_kinetic_karaoke_9x16.mp4", "demo4_side_by_side_transformation_16x9.mp4"]:
            shutil.copy2(os.path.join(OUT_DIR, fname), os.path.join(BACKUP_DIR, fname))
        print("Regenerated Demo 2 and Demo 4 only (preserving 64s master backup and unchanged videos).")
        return

    # 6. Build Complete Master Walkthrough Backup (marvedge_investor_walkthrough_master_backup.mp4 - 64.0s, 1920x1080)
    ch1_mp4 = os.path.join(OUT_DIR, "_ch1_walkthrough.mp4")
    ch2_mp4 = os.path.join(OUT_DIR, "_ch2_walkthrough.mp4")
    ch3_mp4 = os.path.join(OUT_DIR, "_ch3_walkthrough.mp4")

    build_widescreen_chapter(
        demo1_mp4,
        source_16x9,
        ch1_mp4,
        "_ch1.ass",
        "WALKTHROUGH PART 1/4: INTELLIGENT 16:9 TO 9:16 REFRAMING",
        "Problem: Manual keyframing & cropping across desktop recordings -> Solution: Automated Reframe Modes",
        [
            "00:00 - 00:08 | Mode 1: MediaPipe AutoFlip Saliency Crop (9:16 Portrait)",
            "00:08 - 00:16 | Mode 2: Deterministic FFmpeg Blur-Pad Context Fit (9:16 Portrait)",
        ],
    )
    build_widescreen_chapter(
        demo2_mp4,
        source_16x9,
        ch2_mp4,
        "_ch2.ass",
        "WALKTHROUGH PART 2/4: KINETIC PRODUCT CALLOUTS & CUE TIMING (.ASS)",
        "Word-Level ASS \\k Highlight Engine (Ambient Audio Default • Ready for Human Voiceover Remux)",
        [
            "Callout Cues 1-2 (0-8s): \"Marvedge turns wide clips into shorts. Auto-framing tracks the main visual action.\"",
            "Callout Cues 3-4 (8-16s): \"Blur-pad fit preserves full widescreen context. Export vertical videos in one workflow.\"",
        ],
    )
    build_widescreen_chapter(
        demo3_mp4,
        source_16x9,
        ch3_mp4,
        "_ch3.ass",
        "WALKTHROUGH PART 3/4: MULTILINGUAL CAPTION WINDOWS [CONCEPT / RESEARCH PREVIEW]",
        "Concept Preview of Time-Windowed Multi-Language Tracks (Ambient Audio Only — No Synthesized Speech)",
        [
            "Concept / Research Preview: Excluded non-commercial OmniVoice TTS • Ambient audio only",
            "Illustrates BullMQ worker orchestration & dual-layer AVS output validation guards",
        ],
    )

    master_backup_mp4 = os.path.join(OUT_DIR, "marvedge_investor_walkthrough_master_backup.mp4")
    run_ffmpeg(
        [
            "-i", ch1_mp4,
            "-i", ch2_mp4,
            "-i", ch3_mp4,
            "-i", demo4_mp4,
            "-filter_complex",
            "[0:v][0:a][1:v][1:a][2:v][2:a][3:v][3:a]concat=n=4:v=1:a=1[v][a]",
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            master_backup_mp4,
        ],
        "Building 64.0s Standalone Master Walkthrough Backup (marvedge_investor_walkthrough_master_backup.mp4)"
    )

    # Cleanup temp files
    for tmp in [base_9x16, ch1_mp4, ch2_mp4, ch3_mp4, os.path.join(OUT_DIR, "_ch1.ass"), os.path.join(OUT_DIR, "_ch2.ass"), os.path.join(OUT_DIR, "_ch3.ass")]:
        if os.path.exists(tmp):
            os.remove(tmp)

    # 7. Copy all final MP4s and master backup to separate folder (investor-demo/final-mp4-backup/)
    final_mp4s = [
        "source_landscape_16x9.mp4",
        "demo1_intelligent_reframe_9x16.mp4",
        "demo2_kinetic_karaoke_9x16.mp4",
        "demo3_multilingual_research_preview_9x16.mp4",
        "demo4_side_by_side_transformation_16x9.mp4",
        "marvedge_investor_walkthrough_master_backup.mp4",
    ]
    for fname in final_mp4s:
        shutil.copy2(os.path.join(OUT_DIR, fname), os.path.join(BACKUP_DIR, fname))

    print("All showcase videos, master backup, and backup folder copies completed successfully.")

if __name__ == "__main__":
    main()

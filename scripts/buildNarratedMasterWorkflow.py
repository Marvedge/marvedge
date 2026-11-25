import os
import shutil
import hashlib
import json
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_DIR = os.path.join(ROOT, "investor-demo", "demo-assets")
BACKUP_DIR = os.path.join(ROOT, "investor-demo", "final-mp4-backup")
DEMO_ROOT = os.path.join(ROOT, "investor-demo")

def run_ffmpeg(args, desc):
    print(f"[FFmpeg] {desc}...")
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"] + args
    res = subprocess.run(cmd, cwd=OUT_DIR, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg failed on {desc}:\n{res.stderr}")

def make_slate_ass(ass_path, lines):
    content = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Kicker,Arial,24,&H00A5B4FC,&H00A5B4FC,&H000F172A,&HC80F172A,-1,0,0,0,100,100,1.2,0,3,8,0,8,80,80,140,1
Style: MainTitle,Arial,44,&H00FFFFFF,&H00FFFFFF,&H001E1B4B,&HC80F172A,-1,0,0,0,100,100,0.5,0,3,12,0,8,80,80,210,1
Style: SubTitle,Arial,28,&H006EE7B7,&H006EE7B7,&H000F172A,&HC80F172A,-1,0,0,0,100,100,0.3,0,3,8,0,8,80,80,295,1
Style: Body1,Arial,25,&H00E2E8F0,&H00E2E8F0,&H000F172A,&HB40F172A,0,0,0,0,100,100,0.2,0,3,8,0,8,120,120,410,1
Style: Body2,Arial,25,&H00E2E8F0,&H00E2E8F0,&H000F172A,&HB40F172A,0,0,0,0,100,100,0.2,0,3,8,0,8,120,120,480,1
Style: Body3,Arial,25,&H00E2E8F0,&H00E2E8F0,&H000F172A,&HB40F172A,0,0,0,0,100,100,0.2,0,3,8,0,8,120,120,550,1
Style: Body4,Arial,25,&H00E2E8F0,&H00E2E8F0,&H000F172A,&HB40F172A,0,0,0,0,100,100,0.2,0,3,8,0,8,120,120,620,1
Style: StatusFoot,Arial,22,&H0000EAFF,&H0000EAFF,&H000F172A,&HC80F172A,-1,0,0,0,100,100,0.4,0,3,8,0,2,80,80,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    for end_sec, style, text in lines:
        content += f"Dialogue: 1,0:00:00.00,0:00:{end_sec:05.2f},{style},,0,0,0,,{text}\n"
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(content)

def render_slate_clip(duration_sec, ass_filename, out_mp4, lines):
    ass_path = os.path.join(OUT_DIR, ass_filename)
    make_slate_ass(ass_path, lines)
    run_ffmpeg(
        [
            "-f", "lavfi", "-i", f"color=c=#090D16:s=1920x1080:r=24:d={duration_sec}",
            "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:d={duration_sec}",
            "-vf", f"subtitles={ass_filename},format=yuv420p",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            out_mp4,
        ],
        f"Rendering {duration_sec}s slate {os.path.basename(out_mp4)}"
    )
    if os.path.exists(ass_path):
        os.remove(ass_path)

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
    if os.path.exists(ass_path):
        os.remove(ass_path)

def main():
    source_16x9 = os.path.join(OUT_DIR, "source_landscape_16x9.mp4")
    demo1_mp4 = os.path.join(OUT_DIR, "demo1_intelligent_reframe_9x16.mp4")
    demo2_mp4 = os.path.join(OUT_DIR, "demo2_kinetic_karaoke_9x16.mp4")
    demo3_mp4 = os.path.join(OUT_DIR, "demo3_multilingual_research_preview_9x16.mp4")
    demo4_mp4 = os.path.join(OUT_DIR, "demo4_side_by_side_transformation_16x9.mp4")

    # 1. Opening Creator-Problem Slate (10.0s: 00:00 -> 00:10)
    s_open = os.path.join(OUT_DIR, "_nm_open.mp4")
    render_slate_clip(
        10,
        "_nm_open.ass",
        s_open,
        [
            (10.0, "Kicker", "MARVEDGE INVESTOR DEMONSTRATION • TIMED NARRATIVE WORKFLOW (100.0s)"),
            (10.0, "MainTitle", "The Creator Workflow Problem: 16:9 Desktop vs. 9:16 Mobile"),
            (10.0, "SubTitle", "Why adapting horizontal screen recordings for vertical channels is fragmented today"),
            (10.0, "Body1", "1. Product demos, tutorials, and webinars are captured in 16:9 desktop widescreen."),
            (10.0, "Body2", "2. Mobile feeds require 9:16 vertical framing without cutting off critical UI context."),
            (10.0, "Body3", "3. Manual keyframing, word-by-word caption timing, and multi-tool exports create bottlenecks."),
            (10.0, "Body4", "4. Marvedge unifies capture, intelligent 9:16 reframing, and ASS kinetic captions in one pipeline."),
            (10.0, "StatusFoot", "STATUS: PRE-NARRATION VISUAL MASTER (AWAITING APPROVED HUMAN VOICEOVER RECORDING)"),
        ],
    )

    # 2. Transition 1 Slate (4.0s: 00:10 -> 00:14)
    s_tr1 = os.path.join(OUT_DIR, "_nm_tr1.mp4")
    render_slate_clip(
        4,
        "_nm_tr1.ass",
        s_tr1,
        [
            (4.0, "Kicker", "DEMONSTRATION CHAPTER 1 OF 4 • (00:14 – 00:30)"),
            (4.0, "MainTitle", "1. Intelligent Landscape-to-Portrait Reframing"),
            (4.0, "SubTitle", "MediaPipe AutoFlip Saliency Crop (0–8s) & FFmpeg Blur-Pad Context Fit (8–16s)"),
            (4.0, "Body1", "Converts 1280x720 landscape recordings into 720x1280 portrait automatically."),
            (4.0, "StatusFoot", "Talk-Track Cue: Introduce AutoFlip subject tracking followed by full-width blur-pad fit."),
        ],
    )

    # 3. Chapter 1 Video (16.0s: 00:14 -> 00:30)
    c_ch1 = os.path.join(OUT_DIR, "_nm_ch1.mp4")
    build_widescreen_chapter(
        demo1_mp4,
        source_16x9,
        c_ch1,
        "_nm_ch1.ass",
        "CHAPTER 1/4: INTELLIGENT 16:9 TO 9:16 REFRAMING (00:14 - 00:30)",
        "Mode 1: MediaPipe AutoFlip Saliency Crop (0-8s) • Mode 2: FFmpeg Blur-Pad Context Fit (8-16s)",
        [
            "00:14 - 00:22 | AutoFlip Saliency Crop: Tracks primary visual subject in 9:16 portrait",
            "00:22 - 00:30 | Blur-Pad Context Fit: Preserves 100% horizontal width over blurred 9:16 canvas",
        ],
    )

    # 4. Transition 2 Slate (4.0s: 00:30 -> 00:34)
    s_tr2 = os.path.join(OUT_DIR, "_nm_tr2.mp4")
    render_slate_clip(
        4,
        "_nm_tr2.ass",
        s_tr2,
        [
            (4.0, "Kicker", "DEMONSTRATION CHAPTER 2 OF 4 • (00:34 – 00:50)"),
            (4.0, "MainTitle", "2. Kinetic Product Callouts & Cue Timing (.ASS \\k)"),
            (4.0, "SubTitle", "Timed Visual Product Callouts & Automated 0.8s Pause Segmentation"),
            (4.0, "Body1", "16.0s Human Voiceover Window (00:34.00 – 00:50.00): 24 Words / 4 Balanced Cues."),
            (4.0, "StatusFoot", "Pre-VO State: Timed visual callouts over ambient audio until human WAV is remuxed."),
        ],
    )

    # 5. Chapter 2 Video (16.0s: 00:34 -> 00:50)
    c_ch2 = os.path.join(OUT_DIR, "_nm_ch2.mp4")
    build_widescreen_chapter(
        demo2_mp4,
        source_16x9,
        c_ch2,
        "_nm_ch2.ass",
        "CHAPTER 2/4: KINETIC PRODUCT CALLOUTS & CUE TIMING (00:34 - 00:50)",
        "Timed Product Callouts (Ambient Audio Default) • 16s Human Narration Target Window",
        [
            "Cue 1-2 (00:34-00:42): \"Marvedge turns wide clips into shorts. Auto-framing tracks the main visual action.\"",
            "Cue 3-4 (00:42-00:50): \"Blur-pad fit preserves full widescreen context. Export vertical videos in one workflow.\"",
        ],
    )

    # 6. Transition 3 Slate (4.0s: 00:50 -> 00:54)
    s_tr3 = os.path.join(OUT_DIR, "_nm_tr3.mp4")
    render_slate_clip(
        4,
        "_nm_tr3.ass",
        s_tr3,
        [
            (4.0, "Kicker", "DEMONSTRATION CHAPTER 3 OF 4 • (00:54 – 01:10) [CONCEPT / RESEARCH PREVIEW]"),
            (4.0, "MainTitle", "3. Multilingual Caption Windows [Concept Preview]"),
            (4.0, "SubTitle", "Time-Windowed EN / ES / FR Caption Formatting & BullMQ AVS Validation Guards"),
            (4.0, "Body1", "DISCLOSURE: Visual concept preview with ambient audio only — NOT a verified dubbing demo."),
            (4.0, "StatusFoot", "Non-commercial OmniVoice TTS WAVs excluded pending commercial voice licensing."),
        ],
    )

    # 7. Chapter 3 Video (16.0s: 00:54 -> 01:10)
    c_ch3 = os.path.join(OUT_DIR, "_nm_ch3.mp4")
    build_widescreen_chapter(
        demo3_mp4,
        source_16x9,
        c_ch3,
        "_nm_ch3.ass",
        "CHAPTER 3/4: MULTILINGUAL CAPTION WINDOWS [CONCEPT PREVIEW] (00:54 - 01:10)",
        "Concept / Research Preview: Ambient Audio Only (No Synthesized Speech) • AVS Output Guards",
        [
            "00:54 - 01:02 | [EN] & [ES] Time-Windowed Caption Preview (Ambient Audio Only)",
            "01:02 - 01:10 | [FR] Time-Windowed Caption Preview & Dual-Layer BullMQ Artifact Guards",
        ],
    )

    # 8. Transition 4 Slate (4.0s: 01:10 -> 01:14)
    s_tr4 = os.path.join(OUT_DIR, "_nm_tr4.mp4")
    render_slate_clip(
        4,
        "_nm_tr4.ass",
        s_tr4,
        [
            (4.0, "Kicker", "DEMONSTRATION CHAPTER 4 OF 4 • (01:14 – 01:30)"),
            (4.0, "MainTitle", "4. Side-by-Side Before & After Transformation"),
            (4.0, "SubTitle", "Frame-Synchronized 16:9 Desktop Source vs. 9:16 Reframed & Captioned Output"),
            (4.0, "Body1", "Inspects the end-to-end transformation across both reframing modes in real time."),
            (4.0, "StatusFoot", "Talk-Track Cue: Compare unframed 1280x720 source against 720x1280 mobile output."),
        ],
    )

    # 9. Closing Summary Slate (10.0s: 01:30 -> 01:40)
    s_close = os.path.join(OUT_DIR, "_nm_close.mp4")
    render_slate_clip(
        10,
        "_nm_close.ass",
        s_close,
        [
            (10.0, "Kicker", "MARVEDGE — ARCHITECTURAL DIFFERENTIATION & SUMMARY (01:30 – 01:40)"),
            (10.0, "MainTitle", "Unified Browser-to-Worker Video Pipeline"),
            (10.0, "SubTitle", "Eliminating fragmented multi-tool handoffs for desktop-to-mobile publishing"),
            (10.0, "Body1", "• Browser-Native Timeline Editor: Multi-layer canvas, custom backgrounds, frame & cursor controls."),
            (10.0, "Body2", "• Dual Reframing Engine: MediaPipe AutoFlip saliency tracking + deterministic FFmpeg blur-pad fit."),
            (10.0, "Body3", "• Automated ASS Karaoke Engine: Word-timestamp normalization, \\k tags & 0.8s pause segmentation."),
            (10.0, "Body4", "• Production Worker Guards: BullMQ retry classification & strict output validation before completion."),
            (10.0, "StatusFoot", "PRE-NARRATION VISUAL MASTER COMPLETE (100.0s) • READY FOR HUMAN VOICEOVER REMUX"),
        ],
    )

    # Concatenate all 9 segments (10 + 4 + 16 + 4 + 16 + 4 + 16 + 4 + 16 + 10 = 100.0s)
    segments = [s_open, s_tr1, c_ch1, s_tr2, c_ch2, s_tr3, c_ch3, s_tr4, demo4_mp4, s_close]
    inputs = []
    concat_filter = ""
    for idx, seg in enumerate(segments):
        inputs.extend(["-i", seg])
        concat_filter += f"[{idx}:v][{idx}:a]"
    concat_filter += f"concat=n={len(segments)}:v=1:a=1[v][a]"

    narrated_master_mp4 = os.path.join(OUT_DIR, "marvedge_investor_demo_narrated.mp4")
    run_ffmpeg(
        inputs
        + [
            "-filter_complex", concat_filter,
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            narrated_master_mp4,
        ],
        "Building 100.0s Paced Narrated Master Workflow (marvedge_investor_demo_narrated.mp4)"
    )

    # Cleanup temp segments
    for seg in [s_open, s_tr1, c_ch1, s_tr2, c_ch2, s_tr3, c_ch3, s_tr4, s_close]:
        if os.path.exists(seg):
            os.remove(seg)

    # Copy to final-mp4-backup/
    shutil.copy2(narrated_master_mp4, os.path.join(BACKUP_DIR, "marvedge_investor_demo_narrated.mp4"))

    # Generate SHA256SUMS.txt and manifest.json
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
        p_main = os.path.join(OUT_DIR, fname)
        p_bak = os.path.join(BACKUP_DIR, fname)
        h_main = hashlib.sha256(open(p_main, "rb").read()).hexdigest()
        h_bak = hashlib.sha256(open(p_bak, "rb").read()).hexdigest()
        assert h_main == h_bak, f"Backup parity mismatch on {fname}"
        size_bytes = os.path.getsize(p_main)
        sha_lines.append(f"{h_main}  demo-assets/{fname}")
        sha_lines.append(f"{h_bak}  final-mp4-backup/{fname}")
        manifest.append({
            "file": fname,
            "sha256": h_main,
            "size_bytes": size_bytes,
            "backup_verified": True,
        })

    with open(os.path.join(DEMO_ROOT, "SHA256SUMS.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(sha_lines) + "\n")

    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"deliverables": manifest}, f, indent=2)

    print("Successfully built marvedge_investor_demo_narrated.mp4 (100.0s) and updated SHA256SUMS.txt.")

if __name__ == "__main__":
    main()

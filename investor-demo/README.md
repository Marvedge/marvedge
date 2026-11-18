# Marvedge Investor Demonstration Package (`Task-00135`)

This directory contains the self-contained, 100% offline investor demonstration package for **Marvedge**. It requires **no Next.js server, no backend services, no Redis, no authentication, no GPU/EC2 instances, and no internet connection**.

---

## 1. Quick Start — Launching the Offline HTML5 Player

Open [`investor-demo/index.html`](./index.html) directly in any modern browser (Chrome, Edge, Safari, Firefox) via `file://`.

### Built-In Player Features

- **Four Showcase Stages (`[1]`–`[4]`):**
  1. **Intelligent 16:9 → 9:16 Reframing** (`demo1_intelligent_reframe_9x16.mp4`)
  2. **Word-Level Kinetic Karaoke Subtitles** (`demo2_kinetic_karaoke_9x16.mp4`)
  3. **Multilingual Localization Architecture [Research Preview]** (`demo3_multilingual_research_preview_9x16.mp4`)
  4. **Side-by-Side Before & After Transformation** (`demo4_side_by_side_transformation_16x9.mp4`)
- **Full-Demo Sequential Playback (`[S]`):** Automatically steps through Demo 1 → Demo 2 → Demo 3 → Demo 4.
- **Synchronized Before/After Split View (`[C]`):** Plays the raw 16:9 desktop source (`source_landscape_16x9.mp4`) in frame-accurate lockstep alongside the selected 9:16 output.
- **Paced Master Workflow (`[N]` — `100.0s`):** Plays `marvedge_investor_demo_narrated.mp4`, which includes the opening Creator-Problem slate (`0–10s`), four `16s` demonstration chapters separated by `4s` transition slates, and a closing Product Summary slate (`90–100s`). Clearly labelled in its pre-narration state until the approved human voiceover is remuxed.
- **Emergency Visual Backup (`[M]` — `64.0s`):** Plays the unchanged `64.0s` standalone visual fallback (`marvedge_investor_walkthrough_master_backup.mp4`).
- **Live Narration Teleprompter & Human Voiceover Loader:** Highlights each word of the 24-word narration script in real time and supports loading a recorded human voiceover `.wav`/`.mp3` file directly into the browser without re-rendering.
- **Graceful Fallback:** Automatically falls back to `final-mp4-backup/` if an asset in `demo-assets/` is moved, or allows manual local file selection.

---

## 2. Directory & Asset Manifest

| Path                                                                                                                           |   Resolution / FPS   |  Duration   | Description & Provenance                                                                                                                                          |
| :----------------------------------------------------------------------------------------------------------------------------- | :------------------: | :---------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`index.html`](./index.html)                                                                                                   |   Responsive HTML5   | Interactive | Standalone offline presentation player (`connect-src 'none'` CSP enforced).                                                                                       |
| [`INVESTOR_DEMO_SCRIPT_AND_CUES.md`](./INVESTOR_DEMO_SCRIPT_AND_CUES.md)                                                       |       Markdown       |   `02:00`   | Two-minute investor script + 16.0s word-level human voiceover recording sheet.                                                                                    |
| [`demo-assets/source_landscape_16x9.mp4`](./demo-assets/source_landscape_16x9.mp4)                                             | `1280×720` / 24 fps  |  `16.00s`   | Owned Marvedge 3D animations (`public/icons/1.mp4` + `2.mp4`).                                                                                                    |
| [`demo-assets/demo1_intelligent_reframe_9x16.mp4`](./demo-assets/demo1_intelligent_reframe_9x16.mp4)                           | `720×1280` / 24 fps  |  `16.00s`   | AutoFlip saliency crop (0–8s) + FFmpeg blur-pad fit (8–16s).                                                                                                      |
| [`demo-assets/demo2_kinetic_karaoke_9x16.mp4`](./demo-assets/demo2_kinetic_karaoke_9x16.mp4)                                   | `720×1280` / 24 fps  |  `16.00s`   | 9:16 reframe with word-level `.ass` `\k` karaoke highlight tags.                                                                                                  |
| [`demo-assets/demo3_multilingual_research_preview_9x16.mp4`](./demo-assets/demo3_multilingual_research_preview_9x16.mp4)       | `720×1280` / 24 fps  |  `16.00s`   | Clearly badged Research Preview (`[EN]` → `[ES]` → `[FR]` cues, cleared ambient audio).                                                                           |
| [`demo-assets/demo4_side_by_side_transformation_16x9.mp4`](./demo-assets/demo4_side_by_side_transformation_16x9.mp4)           | `1920×1080` / 24 fps |  `16.00s`   | Widescreen side-by-side comparison (`16:9` input vs. `9:16` output).                                                                                              |
| [`demo-assets/marvedge_investor_walkthrough_master_backup.mp4`](./demo-assets/marvedge_investor_walkthrough_master_backup.mp4) | `1920×1080` / 24 fps |  `64.00s`   | Unchanged 4-chapter emergency visual fallback playable in VLC / QuickTime / Windows Media Player.                                                                 |
| [`demo-assets/marvedge_investor_demo_narrated.mp4`](./demo-assets/marvedge_investor_demo_narrated.mp4)                         | `1920×1080` / 24 fps |  `100.00s`  | Paced narrative workflow (opening problem slate + 4 chapters + transition buffers + closing summary; pre-narration visual master awaiting human voiceover remux). |
| [`SHA256SUMS.txt`](./SHA256SUMS.txt) / [`demo-assets/manifest.json`](./demo-assets/manifest.json)                              |     Text / JSON      |      —      | Cryptographic SHA-256 verification manifest for all deliverables and backup copies.                                                                               |
| [`final-mp4-backup/`](./final-mp4-backup/)                                                                                     |   `720p` / `1080p`   |      —      | Dedicated redundant backup directory containing copies of all 7 final MP4s.                                                                                       |

---

## 3. Recording & Integrating the Human Voiceover

### Technical Recording Specifications

- **File Format:** Uncompressed WAV (`PCM 16-bit` or `24-bit`, `.wav`)
- **Sample Rate:** `48,000 Hz` (`48 kHz`)
- **Channels:** Mono (`1 ch`) or Stereo (`2 ch`)
- **Target Duration:** `16.00 seconds` (`00:00.00 – 00:16.00`; active speech window `00:00.25 – 00:15.55`)
- **Target Loudness & Levels:** `-16` to `-14 LUFS` integrated, `-1.5 dBTP` true peak ceiling, `<-55 dBFS` noise floor

### Recording Steps

1. Open [`INVESTOR_DEMO_SCRIPT_AND_CUES.md`](./INVESTOR_DEMO_SCRIPT_AND_CUES.md) (Part 1) and record the 24-word narration over a `16.00s` timeline:
   - `00:00.25 – 00:03.30`: _"Marvedge turns wide clips into shorts."_
   - `00:04.25 – 00:07.35`: _"Auto-framing tracks the main visual action."_
   - `00:08.30 – 00:11.40`: _"Blur-pad fit preserves full widescreen context."_
   - `00:12.35 – 00:15.55`: _"Export vertical videos in one workflow."_
2. **Option A (Zero-Build Browser Load):** Click **`+ Load Human Voiceover (.wav/.mp3)`** inside `investor-demo/index.html` to synchronize the audio live in the browser.
3. **Option B (Permanent MP4 Remux):** Run:
   ```bash
   python scripts/remuxHumanVoiceover.py path/to/human_voiceover_en.wav
   ```
   This mixes the human voiceover directly into `demo2_kinetic_karaoke_9x16.mp4` and `demo4_side_by_side_transformation_16x9.mp4` and updates `final-mp4-backup/`.

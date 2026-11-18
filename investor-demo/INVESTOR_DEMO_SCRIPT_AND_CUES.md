# Marvedge — Investor Demonstration Script & Human Voiceover Timing Cues

**Document ID:** `TASK-00135-SCRIPT`
**Target Total Presentation Runtime:** `02:00` (120 seconds)
**In-Video Demo Clip Runtime:** `00:16.00` per showcase clip
**Audio Policy:** Human-recorded English voiceover only (Zero neural TTS generation; zero uncleared third-party audio)
**Claims Policy:** Strictly substantiated technical specifications and verified pipeline metrics only (Zero unverified speed, cost, margin, or engagement claims)

---

## Part 1: In-Video Human Voiceover Script & Word-Level Timing Cues (`16.00s`)

This 24-word script is engineered for recording a single `16.00s` human voiceover file (`human_voiceover_en.wav`, 48 kHz mono/stereo WAV) that synchronizes word-for-word with **Demo 2 (`demo2_kinetic_karaoke_9x16.mp4`)**, **Demo 4 (`demo4_side_by_side_transformation_16x9.mp4`)**, and the Chapter 2 / Chapter 4 windows of the **100-second Paced Master (`marvedge_investor_demo_narrated.mp4`)**.

### Full Verbatim Recording Text (24 Words)

> _"Marvedge turns wide clips into shorts. Auto-framing tracks the main visual action. Blur-pad fit preserves full widescreen context. Export vertical videos in one workflow."_

### Human Voiceover Recording Technical Specifications

- **Audio Format:** Uncompressed WAV (`PCM 16-bit` or `24-bit` little-endian, `.wav`).
- **Sample Rate:** `48,000 Hz` (`48 kHz` — matches the native `48 kHz` audio stream of all showcase MP4s, preventing sample-rate conversion drift).
- **Channel Configuration:** Mono (`1 ch`) or Stereo (`2 ch`); mono recordings are automatically centered to stereo by `scripts/remuxHumanVoiceover.py`.
- **Target Duration:** `16.00 seconds` exact timeline (`00:00.00` to `00:16.00`), with spoken phrases beginning at `00:00.25` and ending at `00:15.55`.
- **Recommended Recording Levels:**
  - **Integrated Loudness:** `-16 LUFS` to `-14 LUFS`
  - **True Peak Ceiling:** `-1.5 dBTP` to `-1.0 dBTP` (voice peaks between `-6 dBFS` and `-3 dBFS`)
  - **Room Tone / Noise Floor:** Below `-55 dBFS`
- **Pre-Recording Semantic Integrity Policy:** Until the human voiceover WAV is recorded and loaded/remuxed, **Demo 2** is labelled in-video and in-player as **Timed Kinetic Product Callouts over Ambient Audio** (not speech-synchronized narration). No neural TTS or unrelated speech is substituted.

### Segment & Breath-Pause Recording Sheet

|   Cue #   |      Time Window      | Duration | Spoken Phrase (Verbatim)                            |     Pause After Cue     | Visual Context on Screen                                                                        |
| :-------: | :-------------------: | :------: | :-------------------------------------------------- | :---------------------: | :---------------------------------------------------------------------------------------------- |
| **Cue 1** | `00:00.25 – 00:03.30` | `3.05s`  | _"Marvedge turns wide clips into shorts."_          | `0.95s` (`03.30–04.25`) | AutoFlip 9:16 saliency crop tracks conveyor input cubes entering the Marvedge unit.             |
| **Cue 2** | `00:04.25 – 00:07.35` | `3.10s`  | _"Auto-framing tracks the main visual action."_     | `0.95s` (`07.35–08.30`) | 9:16 AutoFlip crop centers on the main processing chamber and incoming cubes.                   |
| **Cue 3** | `00:08.30 – 00:11.40` | `3.10s`  | _"Blur-pad fit preserves full widescreen context."_ | `0.95s` (`11.40–12.35`) | Transitions at `08.00s` to 9:16 Blur-Pad Fit mode preserving 100% of the 16:9 horizontal width. |
| **Cue 4** | `00:12.35 – 00:15.55` | `3.20s`  | _"Export vertical videos in one workflow."_         | `0.45s` (`15.55–16.00`) | Finished vertical video cards emerge on the right side of the frame.                            |

### Word-Level Callout Highlight Table (`.ass` `\k` Centisecond Tags)

| Word # | Word           | Start (`s`) | End (`s`) | `.ass` Tag | Cue Group |
| :----: | :------------- | :---------: | :-------: | :--------: | :-------: |
|   1    | `Marvedge`     |   `0.25`    |  `0.80`   |  `{\k55}`  |   Cue 1   |
|   2    | `turns`        |   `0.86`    |  `1.30`   |  `{\k44}`  |   Cue 1   |
|   3    | `wide`         |   `1.36`    |  `1.76`   |  `{\k40}`  |   Cue 1   |
|   4    | `clips`        |   `1.82`    |  `2.26`   |  `{\k44}`  |   Cue 1   |
|   5    | `into`         |   `2.32`    |  `2.68`   |  `{\k36}`  |   Cue 1   |
|   6    | `shorts.`      |   `2.74`    |  `3.30`   |  `{\k56}`  |   Cue 1   |
|   7    | `Auto-framing` |   `4.25`    |  `4.85`   |  `{\k60}`  |   Cue 2   |
|   8    | `tracks`       |   `4.91`    |  `5.32`   |  `{\k41}`  |   Cue 2   |
|   9    | `the`          |   `5.38`    |  `5.66`   |  `{\k28}`  |   Cue 2   |
|   10   | `main`         |   `5.72`    |  `6.14`   |  `{\k42}`  |   Cue 2   |
|   11   | `visual`       |   `6.20`    |  `6.68`   |  `{\k48}`  |   Cue 2   |
|   12   | `action.`      |   `6.74`    |  `7.35`   |  `{\k61}`  |   Cue 2   |
|   13   | `Blur-pad`     |   `8.30`    |  `8.75`   |  `{\k45}`  |   Cue 3   |
|   14   | `fit`          |   `8.81`    |  `9.38`   |  `{\k57}`  |   Cue 3   |
|   15   | `preserves`    |   `9.44`    |  `10.02`  |  `{\k58}`  |   Cue 3   |
|   16   | `full`         |   `10.08`   |  `10.42`  |  `{\k34}`  |   Cue 3   |
|   17   | `widescreen`   |   `10.48`   |  `10.92`  |  `{\k44}`  |   Cue 3   |
|   18   | `context.`     |   `10.98`   |  `11.40`  |  `{\k42}`  |   Cue 3   |
|   19   | `Export`       |   `12.35`   |  `12.85`  |  `{\k50}`  |   Cue 4   |
|   20   | `vertical`     |   `12.91`   |  `13.45`  |  `{\k54}`  |   Cue 4   |
|   21   | `videos`       |   `13.51`   |  `14.00`  |  `{\k49}`  |   Cue 4   |
|   22   | `in`           |   `14.06`   |  `14.32`  |  `{\k26}`  |   Cue 4   |
|   23   | `one`          |   `14.38`   |  `14.75`  |  `{\k37}`  |   Cue 4   |
|   24   | `workflow.`    |   `14.81`   |  `15.55`  |  `{\k74}`  |   Cue 4   |

---

## Part 2: Complete Two-Minute Investor Presentation Script (`00:00 – 02:00`)

### Section 1: The Creator Workflow Problem (`00:00 – 00:24`)

**[UI Action: Open Offline HTML5 Presentation Player (`investor-demo/index.html`) on Overview / Before & After View]**

> **Presenter:**
> _"Product teams, educators, and creators record almost all of their source content—software walkthroughs, tutorials, and webinars—in 16-by-9 desktop widescreen._
> _However, audience distribution increasingly requires 9-by-16 vertical video for mobile feeds._
> _Today, adapting a horizontal screen recording into a mobile-ready vertical clip requires fragmented manual steps: exporting raw footage into a desktop nonlinear editor, manually keyframing crop windows so UI actions aren't cut off, generating and timing word-level subtitles, and re-exporting separate aspect ratios."_

---

### Section 2: Marvedge's Solution & Transition to Demo 1 — Intelligent Reframing (`00:24 – 00:48`)

**[UI Action: Click Card 1 — "1. Intelligent 16:9 to 9:16 Reframing" (or press key `1`)]**

> **Presenter:**
> _"Marvedge unifies recording, timeline editing, and automated vertical adaptation into a single pipeline._
> _In our first demonstration, we start with a 1280-by-720 landscape source animation._
> _During the first eight seconds, Marvedge applies MediaPipe AutoFlip saliency tracking to convert the 16-by-9 frame into a 9-by-16 portrait crop that follows the primary visual subject._
> _At the eight-second mark, you see our second reframing mode—deterministic blur-pad context fit—which preserves 100 percent of the horizontal frame centered over a blurred, luminance-balanced 9-by-16 canvas when full-width UI context must remain visible."_

---

### Section 3: Transition to Demo 2 — Word-Level Kinetic Karaoke Subtitles (`00:48 – 01:12`)

**[UI Action: Click Card 2 — "2. Kinetic Karaoke Subtitles" (or press key `2`)]**

> **Presenter:**
> _"Once the vertical frame is established, mobile viewers need readable, synchronized captions._
> _In Demo 2, Marvedge's subtitle engine normalizes word-level timestamps into Advanced SubStation Alpha—or ASS—karaoke tags._
> _Our segmentation logic automatically detects speech pauses of 0.8 seconds or longer and caps line lengths so phrases never overflow a narrow 9-by-16 viewport._
> _Each word highlights dynamically in exact centisecond alignment with the narration script."_

---

### Section 4: Transition to Demo 3 (Research Preview) & Demo 4 (Side-by-Side Comparison) (`01:12 – 01:38`)

**[UI Action: Click Card 3 — "3. Multilingual Localization [Research Preview]" (key `3`), then Card 4 — "4. Side-by-Side Transformation" (key `4`)]**

> **Presenter:**
> _"In Demo 3, we show a Research Preview of our multilingual localization and audio-visual synchronization pipeline, illustrating time-windowed caption and track alignment across English, Spanish, and French._
> _We intentionally label this module as a Research Preview while commercial voice-licensing and full-video lip-sync validation are finalized._
> _Switching to Demo 4, you can inspect the synchronized side-by-side transformation: the raw 16-by-9 landscape input on the left compared frame-for-frame against the 9-by-16 reframed and captioned output on the right."_

---

### Section 5: Product Differentiation & Substantiated Business-Impact Closing (`01:38 – 02:00`)

**[UI Action: Toggle Interactive Before/After Slider or Summary Panel]**

> **Presenter:**
> _"What differentiates Marvedge is architectural integration._
> _Rather than bolting a standalone wrapper onto third-party editors, Marvedge combines a browser-based multi-layer timeline editor with an asynchronous BullMQ worker pipeline, deterministic FFmpeg filter-graph generation, and strict output validation guards that reject incomplete or unaligned renders before they reach the user._
> _By consolidating screen capture, intelligent 9-by-16 reframing, and word-level kinetic captioning into one repeatable workflow, Marvedge eliminates multi-tool handoffs for teams publishing across desktop and mobile channels."_

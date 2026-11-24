# Task-00136 — Investor Demo End-to-End Rehearsal Runbook & Checklist

- **Document:** `docs/qa/TASK-00136-INVESTOR-DEMO-REHEARSAL.md`
- **Task:** Task-00136 — Investor Demo Rehearsal & Evidence Audit
- **Date:** 2026-11-24
- **Active Branch:** `task/task-00135-investor-demo`
- **Base Commit:** `f227e8c88c972471ada7ec33fbef093b4ab0cbbb` (`feat(demo): add offline investor demo package`)
- **Offline Browser Player Rehearsal Status:** **`PASS (8/8 Modes User-Confirmed on 2026-11-24)`** (Demo 1, Demo 2, Demo 3, Demo 4, Full Sequence `[S]`, Split Compare `[C]`, 100s Paced Master `[N]`, and 64s Emergency Backup `[M]`)
- **External VLC Backup Playback Status:** **`PASS (User-Confirmed on 2026-11-24)`**
- **Full 2-Minute Timed Presenter Rehearsal Status:** **`PASS (User-Confirmed on 2026-11-24 — Completed in ~2 Minutes)`**

---

## 1. Executive Summary & Scope Disclosure

This document provides the end-to-end presenter rehearsal checklist, verified manual rehearsal outcomes, stage-by-stage talk-track alignment, technical claim boundaries, failure modes, and multi-tier fallback protocol for the **Marvedge Offline Investor Demonstration Package (`Task-00135`)**.

> [!IMPORTANT]
> **Mandatory Rehearsal & Voiceover Status Disclosures:**
>
> 1. **End-to-End Rehearsal Completion (`PASS — User-Confirmed Manual Rehearsal on 2026-11-24`):**
>    - **Browser Playback (`PASS 8/8`):** The user manually rehearsed and confirmed successful playback inside `investor-demo/index.html` across all eight presentation modes: **Demo 1 (Intelligent Reframe)**, **Demo 2 (Kinetic Karaoke)**, **Demo 3 (Multilingual Research Preview)**, **Demo 4 (Side-by-Side Transformation)**, **Full Sequence (`[S]`)**, **Split Compare (`[C]`)**, **100s Paced Master (`[N]`)**, and **64s Emergency Backup (`[M]`)**.
>    - **External VLC Backup (`PASS`):** The user confirmed that the external VLC backup video played successfully.
>    - **Timed Presenter Rehearsal (`PASS`):** The user confirmed completion of the full presenter rehearsal in approximately two minutes (`~02:00`).
>    - **Verification Provenance:** These outcomes are recorded strictly as **user-confirmed manual rehearsal results on `2026-11-24`** (no automated UI playback telemetry or additional timing measurements are fabricated).
> 2. **Voiceover Status (`PENDING` 16s Product Narration vs. Completed Local Podcast Audio Tests):**
>    - The committed investor demo assets (`investor-demo/demo-assets/demo2_kinetic_karaoke_9x16.mp4`, `demo4_side_by_side_transformation_16x9.mp4`, and the 100-second paced master `marvedge_investor_demo_narrated.mp4`) remain in their **unchanged pre-narration state**, presenting **Timed Visual Product Callouts over Ambient Audio**.
>    - The 16.0-second (24-word) Marvedge-specific product voiceover (`human_voiceover_en.wav` defined in `investor-demo/INVESTOR_DEMO_SCRIPT_AND_CUES.md`) **has not yet been recorded**.
>    - Separately, a 100.0-second conversational English segment (`75.50s–175.50s`) was extracted from the approved 50-minute podcast recording (`temp_pipeline_validation/youtube_source_temp.mp4` $\to$ `temp_pipeline_validation/podcast_audio_integration/podcast_segment_75s_175s_48k_stereo.wav`) and tested in two local sandboxed integrations (`marvedge_investor_demo_narrated_podcast_100s.mp4` and `marvedge_investor_demo_narrated_remux_chapters2_4.mp4`). Because the podcast dialogue discusses filming a YouTube audition reel for MTV rather than narrating the Marvedge product workflow, **it was intentionally not merged into the committed investor demo master** to avoid speech-vs-callout semantic mismatch.
> 3. **100% Offline Deterministic Execution:** All primary investor demo stages run offline from pre-rendered MP4 deliverables via `investor-demo/index.html`. Live cloud/GPU inference must **not** be attempted during an investor pitch because the AWS EC2 GPU worker (`i-02aa4578f3790bae1`) is stopped (`Code 80`) and the Vercel Dev callback route (`POST /api/jobs/callback`) is currently blocked (`HTTP 503`).

---

## 2. Pre-Rehearsal Technical Verification Checklist

Before beginning a live presenter rehearsal or investor meeting, complete the following pre-flight checks:

|     # | Check Item                                   | Verification Action                                                                                                                                                          | Expected Result                                                                                                         | Status                                                             |
| ----: | :------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------- |
| **1** | **Cryptographic Asset Integrity**            | Compare files in `investor-demo/demo-assets/` and `investor-demo/final-mp4-backup/` against `investor-demo/SHA256SUMS.txt` and `investor-demo/demo-assets/manifest.json`.    | All 7 primary MP4s and 7 mirrored backup MP4s match their committed SHA-256 digests (`f227e8c`).                        | **PASS** (`2026-11-23`)                                            |
| **2** | **Offline Browser Harness Visual Review**    | Open `investor-demo/index.html` locally in the browser and visually inspect the player presentation and layout.                                                              | Player loads locally via `investor-demo/index.html`; visual presentation reviewed and confirmed acceptable by the user. | **PASS — User-Confirmed (`2026-11-24`)**                           |
| **3** | **All-Stage Playback & Shortcut Dry Run**    | Individually play through all four demo stages (`1`–`4`), Full Sequence (`S`), Split Compare (`C`), 100s Paced Master (`N`), and 64s Backup (`M`) end-to-end in the browser. | All 8 browser playback modes (`1`, `2`, `3`, `4`, `S`, `C`, `N`, `M`) play and switch cleanly in `index.html`.          | **PASS (8/8) — User-Confirmed Manual Rehearsal (`2026-11-24`)**    |
| **4** | **VLC / Native Media Player Standby**        | Pre-open and test `investor-demo/final-mp4-backup/marvedge_investor_walkthrough_master_backup.mp4` (`64.0s`) in external VLC media player.                                   | External VLC backup plays smoothly as an independent OS-level fallback outside the browser.                             | **PASS — User-Confirmed Manual Rehearsal (`2026-11-24`)**          |
| **5** | **Supplementary AutoFlip Proof Clips Ready** | Pre-locate `temp_pipeline_validation/presenter_expB_side_by_side.mp4` (`1684×720`, `18.02s`) and `presenter_expB_kinematic_every_frame_9x16.mp4` (`404×720`, `18.02s`).      | Available to show real human-face dynamic tracking (`88` unique X coordinates across `296–427 px`) if asked during Q&A. | **PASS** (`2026-11-23`)                                            |
| **6** | **Full 2-Minute Timed Presenter Dry Run**    | Presenter speaks the 5-section script in `investor-demo/INVESTOR_DEMO_SCRIPT_AND_CUES.md` (Part 2) while stepping through Stages 1–4 inside the `02:00` target window.       | Complete presenter rehearsal finished in approximately two minutes (`~02:00`) aligned with stage transitions.           | **PASS (~2 min) — User-Confirmed Manual Rehearsal (`2026-11-24`)** |

### 2.1 Verified Manual Rehearsal Results Summary (`2026-11-24`)

| Rehearsal Dimension          | Sub-Mode / Component Tested                                                                 |  Result  | Verification Basis                             |
| :--------------------------- | :------------------------------------------------------------------------------------------ | :------: | :--------------------------------------------- |
| **Browser Playback (`1/8`)** | **Demo 1 — Intelligent Reframe** (`demo1_intelligent_reframe_9x16.mp4`)                     | **PASS** | User-confirmed manual rehearsal (`2026-11-24`) |
| **Browser Playback (`2/8`)** | **Demo 2 — Kinetic Karaoke** (`demo2_kinetic_karaoke_9x16.mp4`)                             | **PASS** | User-confirmed manual rehearsal (`2026-11-24`) |
| **Browser Playback (`3/8`)** | **Demo 3 — Multilingual Research Preview** (`demo3_multilingual_research_preview_9x16.mp4`) | **PASS** | User-confirmed manual rehearsal (`2026-11-24`) |
| **Browser Playback (`4/8`)** | **Demo 4 — Side-by-Side Transformation** (`demo4_side_by_side_transformation_16x9.mp4`)     | **PASS** | User-confirmed manual rehearsal (`2026-11-24`) |
| **Browser Playback (`5/8`)** | **Full Sequence (`[S]`)** (Sequential `Demo 1` $\to$ `Demo 4`)                              | **PASS** | User-confirmed manual rehearsal (`2026-11-24`) |
| **Browser Playback (`6/8`)** | **Split Compare (`[C]`)** (`16:9` source vs. `9:16` output)                                 | **PASS** | User-confirmed manual rehearsal (`2026-11-24`) |
| **Browser Playback (`7/8`)** | **100s Paced Master (`[N]`)** (`marvedge_investor_demo_narrated.mp4`)                       | **PASS** | User-confirmed manual rehearsal (`2026-11-24`) |
| **Browser Playback (`8/8`)** | **64s Emergency Backup (`[M]`)** (`marvedge_investor_walkthrough_master_backup.mp4`)        | **PASS** | User-confirmed manual rehearsal (`2026-11-24`) |
| **External Player Fallback** | **External VLC Backup Playback**                                                            | **PASS** | User-confirmed manual rehearsal (`2026-11-24`) |
| **Presenter Run-Through**    | **Full Timed Presenter Rehearsal (`~2 minutes`)**                                           | **PASS** | User-confirmed manual rehearsal (`2026-11-24`) |

---

## 3. End-to-End Stage-by-Stage Demo Rehearsal Matrix

Each stage below maps what the presenter shows, what the audience observes, what technical capability is genuinely demonstrated, what is **not** demonstrated, potential failure points, and the deterministic fallback path.

### Stage 0: Opening Problem & Architecture Overview (`00:00 – 00:24`)

- **What the Presenter Should Show:**
  - Open `investor-demo/index.html` on the main display (or launch the 100-second Paced Master via key `N` during the `00:00–00:14` opening problem and Chapter 1 transition slates).
  - Reference `investor-demo/INVESTOR_DEMO_SCRIPT_AND_CUES.md` (Part 2, Section 1: _"The Creator Workflow Problem"_).
- **What the Audience Should Observe:**
  - The 4-stage pipeline navigation sidebar (`1. Intelligent Reframing`, `2. Kinetic Karaoke Subtitles`, `3. Multilingual Localization [Research Preview]`, `4. Side-by-Side Transformation`), the `1280×720` (`16:9`) desktop landscape source preview, and the synchronized teleprompter bar.
- **What Technical Capability It Demonstrates:**
  - Self-contained offline HTML5 presentation harness (`investor-demo/index.html`) with strict Content-Security-Policy (`connect-src 'none'`).
  - Owned `1280×720` (`24 fps`, `16.00s`) Marvedge 3D source animation (`investor-demo/demo-assets/source_landscape_16x9.mp4`, concatenated from `public/icons/1.mp4` and `public/icons/2.mp4`).
- **What It Does NOT Demonstrate:**
  - Does **not** demonstrate the live Next.js web application (`app/`), user authentication (`NextAuth`), Cloudinary browser upload, or live BullMQ/Redis queue ingestion.
- **Potential Failure Points:**
  - Browser window accidentally opened on a missing file path; display scaling (`>150%` DPI) clipping the bottom teleprompter bar on a 13-inch laptop screen.
- **Fallback if Live Demonstration Fails:**
  - Press `Ctrl+-` (`Cmd+-`) to set browser zoom to `90%–100%`, or switch immediately to the pre-opened VLC window playing `investor-demo/final-mp4-backup/marvedge_investor_demo_narrated.mp4` (`100.0s`).

---

### Stage 1: Demo 1 — Intelligent `16:9` $\to$ `9:16` Reframing (`00:24 – 00:48`)

- **What the Presenter Should Show:**
  - Click **Card 1 — "1. Intelligent 16:9 to 9:16 Reframing"** (or press key `1`) to play `investor-demo/demo-assets/demo1_intelligent_reframe_9x16.mp4` (`720×1280`, `24 fps`, `16.00s`).
  - Deliver Section 2 of the pitch script (`INVESTOR_DEMO_SCRIPT_AND_CUES.md` lines 84–93).
- **What the Audience Should Observe:**
  - **`00:00 – 00:08` (Mode 1 — AutoFlip Saliency Crop):** The `16:9` landscape animation is cropped into a `9:16` vertical frame that tracks the incoming conveyor cubes entering the Marvedge processing chamber.
  - **`00:08 – 00:16` (Mode 2 — Blur-Pad Context Fit):** At the `8.00s` boundary, the framing transitions to full-width `16:9` preservation centered over a Gaussian-blurred, luminance-balanced `9:16` background canvas so wide horizontal context is never clipped.
- **What Technical Capability It Demonstrates:**
  - Pre-rendered output combining MediaPipe AutoFlip saliency crop (`public/icons/autoflip_1_pr354_9x16.mp4`) and deterministic FFmpeg blur-pad fit composition (`scripts/buildInvestorDemoVideos.py` and `scripts/demoCaptionedCroppedClip.ts --reframe-mode fit`).
- **What It Does NOT Demonstrate:**
  - Does **not** execute live AutoFlip container inference during playback.
  - Does **not** demonstrate GPU-accelerated AutoFlip (AutoFlip runs on CPU; compiled with `MEDIAPIPE_DISABLE_GPU=1` in `autoflip/Dockerfile` line 222).
  - Does **not** demonstrate human-face tracking on `source_landscape_16x9.mp4` (which is a 3D graphic animation with zero faces) or multi-speaker TalkNet active-speaker switching.
- **Potential Failure Points:**
  - Investor asks to see dynamic face tracking on a real human speaker rather than a 3D conveyor animation; or primary MP4 path fails to load.
- **Fallback if Live Demonstration Fails:**
  - **Path Fallback:** `investor-demo/index.html` (lines 1367–1374) automatically catches `<video>` load errors and fails over to `investor-demo/final-mp4-backup/demo1_intelligent_reframe_9x16.mp4`.
  - **Human-Speaker Q&A Proof Fallback:** Open `temp_pipeline_validation/presenter_expB_side_by_side.mp4` (`1684×720`, `18.02s`), which shows genuine local `run_autoflip_to_json` face tracking (`autoflip_expB_kinematic_face_only.pbtxt`, `88` unique X coordinates across `296–427 px`) on a real human podcast presenter.

---

### Stage 2: Demo 2 — Word-Level Kinetic `.ASS` Callout Engine (`00:48 – 01:12`)

- **What the Presenter Should Show:**
  - Click **Card 2 — "2. Kinetic Karaoke Subtitles"** (or press key `2`) to play `investor-demo/demo-assets/demo2_kinetic_karaoke_9x16.mp4` (`720×1280`, `24 fps`, `16.00s`).
  - Point out the live teleprompter bar beneath the video player highlighting each of the 24 words across the four cues (`Cue 1: 0.25–3.30s`, `Cue 2: 4.25–7.35s`, `Cue 3: 8.30–11.40s`, `Cue 4: 12.35–15.55s`).
- **What the Audience Should Observe:**
  - Four balanced product callout phrases burned into the `9:16` video with word-by-word yellow karaoke fills (`{\k}` centisecond tags) that align with the visual transition from AutoFlip crop (`Cues 1–2`, `0–8s`) to Blur-Pad Context Fit (`Cues 3–4`, `8–16s`):
    - **Cue 1 (`0.25–3.30s`):** _"Marvedge turns wide clips into shorts."_
    - **Cue 2 (`4.25–7.35s`):** _"Auto-framing tracks the main visual action."_
    - **Cue 3 (`8.30–11.40s`):** _"Blur-pad fit preserves full widescreen context."_
    - **Cue 4 (`12.35–15.55s`):** _"Export vertical videos in one workflow."_
- **What Technical Capability It Demonstrates:**
  - Marvedge's TypeScript `.ass` subtitle compilation and validation engine (`app/lib/subtitles/ass.ts`, `cues.ts`, `resizing.ts`, `style.ts`), backed by **326 passing Vitest unit tests** (`npm test -- app/lib/subtitles/`) and deterministic FFmpeg `libass` rasterization (`scripts/generateInvestorDemoSubtitles.ts`).
- **What It Does NOT Demonstrate:**
  - **Does NOT demonstrate live Speech-to-Text (STT) transcription or automated speech-to-word alignment on spoken audio.** The audio track in `demo2_kinetic_karaoke_9x16.mp4` is ambient mechanical/synth audio from `1.mp4`/`2.mp4`, and the callout timestamps come from the deterministic manifest `investor-demo/demo-assets/demo2_narration_cues.json` until the human 24-word voiceover WAV is recorded and remuxed.
- **Potential Failure Points:**
  - **Critical Credibility Risk:** If the presenter claims the yellow word highlights are live Whisper/Deepgram speech transcription of the video's current audio track, an investor listening to the ambient audio will immediately notice there is no spoken voice in the clip.
- **Fallback if Live Demonstration Fails:**
  - **Verbal Framing Guardrail:** Always describe Demo 2 accurately as _"our ASS kinetic callout and subtitle rendering engine demonstrating centisecond `\k` word-highlight tags and 0.8-second pause segmentation, currently shown in pre-voiceover callout mode over ambient audio."_
  - **Media Fallback:** Automatic failover to `investor-demo/final-mp4-backup/demo2_kinetic_karaoke_9x16.mp4` or local file picker (`#fallbackManualVideoInput`).

---

### Stage 3: Demo 3 — Multilingual Localization Architecture [Research Preview] (`01:12 – 01:25`)

- **What the Presenter Should Show:**
  - Click **Card 3 — "3. Multilingual Localization [Research Preview]"** (or press key `3`) to play `investor-demo/demo-assets/demo3_multilingual_research_preview_9x16.mp4` (`720×1280`, `24 fps`, `16.00s`).
  - Explicitly call attention to the amber **`RESEARCH PREVIEW`** badge in the UI card and stage banner.
- **What the Audience Should Observe:**
  - Time-windowed multilingual caption formatting transitioning cleanly across three language windows over cleared ambient audio:
    - **`00:00.25 – 00:05.10` (`[EN]`):** English callout window
    - **`00:05.45 – 00:10.45` (`[ES]`):** Spanish localized callout window
    - **`00:10.80 – 00:15.65` (`[FR]`):** French localized callout window
- **What Technical Capability It Demonstrates:**
  - Multilingual `.ass` subtitle track formatting, character-length line-wrapping across Romance languages (`investor-demo/demo-assets/demo3_multilingual_cues.json`), and transparent R&D disclosure in the player UI.
  - Backed in the codebase by the hardened BullMQ dubbing worker (`video-worker/index.ts`, **110/110 passing worker tests** in `Task-00132` PR #578) and isolated Tesla T4 VoiceStudio TTS synthesis benchmarks (`380.3s` GPU compute for `999.32s` speech = `0.3806x` RTF in `Task-00103`).
- **What It Does NOT Demonstrate:**
  - **Does NOT play synthesized Spanish/French speech or lip-synced video dubbing.**
  - Pre-synthesized VoiceStudio OmniVoice WAVs (`temp_dubbing_validation/test1_es_primary.wav`, `test2_fr_primary.wav`) were deliberately excluded from the committed investor demo package because `k2-fsa/OmniVoice` weights are licensed under **CC-BY-NC 4.0 (Non-Commercial)** and perceptual AVS lip-sync sign-off remains blocked by historical source/audio asset mismatch (`TASK-00132-PHASE-8-COMPLETION-REPORT.md` §6.1).
- **Potential Failure Points:**
  - Investor expects to hear spoken Spanish/French dubbing when clicking Card 3.
- **Fallback if Live Demonstration Fails:**
  - State upfront before pressing play: _"Demo 3 is a silent-speech visual concept preview of our multilingual subtitle windowing and AVS validation architecture; we intentionally excluded our R&D OmniVoice neural audio tracks from this commercial deck while we transition from non-commercial CC-BY-NC 4.0 research weights to Apache-2.0 open weights and ElevenLabs commercial enterprise tiers."_

---

### Stage 4: Demo 4 — Side-by-Side Before & After Transformation (`01:25 – 02:00`)

- **What the Presenter Should Show:**
  - Click **Card 4 — "4. Side-by-Side Transformation"** (key `4`) to play `investor-demo/demo-assets/demo4_side_by_side_transformation_16x9.mp4` (`1920×1080`, `24 fps`, `16.00s`).
  - Optionally press key `N` to show the **100-second Paced Master (`marvedge_investor_demo_narrated.mp4`)** or key `C` to show the interactive dual-video split view.
- **What the Audience Should Observe:**
  - A frame-accurate `1920×1080` widescreen composition showing the raw `16:9` (`1280×720`) input on the left synchronized against the `9:16` (`720×1280`) reframed and captioned output on the right across both the `0–8s` AutoFlip crop and `8–16s` Blur-Pad Context Fit modes.
- **What Technical Capability It Demonstrates:**
  - Deterministic multi-stream FFmpeg filtergraph composition (`scale`, `pad`, `overlay`, `subtitles`) combining horizontal source footage and vertical mobile deliverables in a single reproducible build pipeline (`scripts/buildInvestorDemoVideos.py`).
- **What It Does NOT Demonstrate:**
  - Does **not** demonstrate real-time cloud transcoding latency or concurrent multi-user worker throughput.
- **Potential Failure Points:**
  - Using the interactive browser dual-video split view (key `C`, which synchronizes two separate `<video>` elements via `timeupdate` in `index.html` lines 1321–1326) can exhibit up to `250 ms` drift on underpowered presentation laptops.
- **Fallback if Live Demonstration Fails:**
  - Always prefer **Card 4 (`demo4_side_by_side_transformation_16x9.mp4`)** over key `C` during high-stakes presentations because Card 4 is a single pre-composited `1920×1080` video stream where left and right panels are hardware-locked frame-for-frame.

---

## 4. Three-Tier Emergency Fallback Protocol

If any browser, codec, or file-path issue occurs during the presentation:

1. **Tier 1 (Automatic In-Browser Backup Failover):**
   - `investor-demo/index.html` (`mainVideo.addEventListener("error")`, lines 1367–1374) automatically rewrites the video source from `demo-assets/<file>.mp4` to `final-mp4-backup/<file>.mp4` and reloads transparently.
2. **Tier 2 (Manual Local File Picker Inside HTML Player):**
   - If both relative directories are unavailable, `index.html` reveals the fallback panel (`#fallbackPanel`, lines 1375–1450) with:
     - **`Launch Master Walkthrough Backup (64s)`** button (`#btnFallbackTryMaster`)
     - **`Select Local MP4 File...`** input (`#fallbackManualVideoInput`), which plays any local `.mp4` via `URL.createObjectURL(file)`.
3. **Tier 3 (Zero-Browser Native OS Media Player Fallback):**
   - Alt-Tab directly to VLC / QuickTime / Windows Media Player and play:
     - **64-Second Visual Fallback:** `investor-demo/final-mp4-backup/marvedge_investor_walkthrough_master_backup.mp4` (`1920×1080`, `24 fps`, `64.00s`, SHA-256: `7f467ed3c80538013fc1032aa7edfeb3fa6158e193c747604c36a265aca18312`).
     - **100-Second Paced Master:** `investor-demo/final-mp4-backup/marvedge_investor_demo_narrated.mp4` (`1920×1080`, `24 fps`, `100.00s`, SHA-256: `d631b0bb5053af921a5445780852010b5662f7c38a012b5ca348029ed1a6c150`).
     - **Real Human-Face AutoFlip Tracking Proof:** `temp_pipeline_validation/presenter_expB_side_by_side.mp4` (`1684×720`, `29.97 fps`, `18.018s`).

---

## 5. Presenter Do-Not-Claim Guardrails

During the rehearsal and investor pitch, the presenter must strictly observe these evidence boundaries:

- **Do NOT claim live cloud or GPU execution during the demo:** The demo is a 100% offline pre-rendered package; EC2 GPU worker `i-02aa4578f3790bae1` is stopped.
- **Do NOT claim Demo 2 is live speech-to-text transcription:** Demo 2 shows timed visual product callouts over ambient audio; the 16-second human product voiceover has not yet been recorded.
- **Do NOT claim Demo 3 is a live or commercially cleared dubbing output:** Demo 3 is a silent-speech Research Preview of multilingual caption windowing; VoiceStudio (`GNU AGPL-3.0`) and `OmniVoice` (`CC-BY-NC 4.0`) require legal/model replacement before commercial use.
- **Do NOT claim the podcast audio test was merged into the investor master:** The 100s podcast segment (`75.50s–175.50s`) was tested only in `temp_pipeline_validation/podcast_audio_integration/` and kept out of the committed master due to semantic mismatch with the Marvedge product callouts.
- **Do NOT present modeled incremental COGS (`$0.1705/min` or `$0.0084/min`) as actual all-in production expenditure:** Always disclose excluded fixed storage (`$9.60/mo` EBS), idle instance uptime, retries, and CDN egress.

# Task-00075: Dubbing Quality Regression Validation Report

**Generated**: `2026-10-13T14:15:30.260Z`
**Verdict**: **`PASS (Local Media & Integrity Verified; Live Provider Blocked / Unverified)`**

---

## 1. Environment & Infrastructure

- **FFmpeg**: `ffmpeg version 9.0.1-essentials_build-www.gyan.dev Copyright (c) 2000-2026 the FFmpeg developers` (Available: true)
- **FFprobe**: `ffprobe version 9.0.1-essentials_build-www.gyan.dev Copyright (c) 2007-2026 the FFmpeg developers` (Available: true)
- **ElevenLabs Credentials**: `NOT_CONFIGURED`
- **Live Provider Opt-In**: `false`

---

## 2. Sample Matrix & Objective Metrics

| Case ID | Sample Title | Role | Duration | Media Decodable | Clipping Risk | Provider Status | Voice Identity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CASE-01** | Single-Speaker Baseline | `single_speaker_baseline` | 20.04s | **PASS** | LOW | **BLOCKED** | NOT_VERIFIED |
| **CASE-02** | Longer Speech Excerpt (30s reproducible excerpt from col.mp4 [01:00-01:30]) | `long_form_excerpt` | 30.06s | **PASS** | LOW | **BLOCKED** | NOT_VERIFIED |
| **CASE-03** | Speech with Background Noise (30s) | `noisy_speech` | 30.04s | **PASS** | LOW | **BLOCKED** | NOT_VERIFIED |
| **CASE-04** | Short Clip Speech (8s public demo asset) | `short_speech_tail` | 8.00s | **PASS** | LOW | **BLOCKED** | NOT_VERIFIED |
| **CASE-05** | Silent Video Negative Control (15.4s moving subject, no audio) | `silent_negative_control` | 15.45s | **PASS** | NOT_APPLICABLE | **NOT_APPLICABLE** | NOT_APPLICABLE |

---

## 3. Sample Case Details & Probe Evidence

### CASE-01: Single-Speaker Baseline
- **Sample Path**: `C:\marvedge-task53-media\02_single_speaker.avi`
- **Role**: `single_speaker_baseline`
- **Source Duration**: 20.04s
- **Decodability Verdict**: `PASS`
- **File Size**: 8.86 MB (9286830 bytes)
- **Audio Codec**: `mp3` (44100 Hz, 2 ch)
- **Peak Volume (dBFS)**: `-0.2 dB` | **Mean Volume**: `-16.9 dB`
- **0 dBFS Samples Count (Clipping Indicator)**: `813` (Saturation flag: LOW)
- **Leading / Trailing Silence**: `0.00s` leading, `0.00s` trailing
- **Provider Execution**: `BLOCKED` — *Live ElevenLabs call skipped (ELEVENLABS_API_KEY is not configured in local environment; live calls require explicit opt-in to avoid paid provider consumption).*
- **Voice Consistency**: `NOT_VERIFIED` — *Automated voice similarity metric not available in repo; requires human listening evaluation against source speaker timbre.*

### CASE-02: Longer Speech Excerpt (30s reproducible excerpt from col.mp4 [01:00-01:30])
- **Sample Path**: `C:\marvedge-task53-media\columbia\col_excerpt_30s.mp4`
- **Role**: `long_form_excerpt`
- **Source Duration**: 30.06s
- **Decodability Verdict**: `PASS`
- **File Size**: 4.99 MB (5230625 bytes)
- **Audio Codec**: `opus` (48000 Hz, 2 ch)
- **Peak Volume (dBFS)**: `-3.7 dB` | **Mean Volume**: `-26.4 dB`
- **Leading / Trailing Silence**: `0.00s` leading, `0.00s` trailing
- **Provider Execution**: `BLOCKED` — *Live ElevenLabs call skipped (ELEVENLABS_API_KEY is not configured in local environment; live calls require explicit opt-in to avoid paid provider consumption).*
- **Voice Consistency**: `NOT_VERIFIED` — *Automated voice similarity metric not available in repo; requires human listening evaluation against source speaker timbre.*

### CASE-03: Speech with Background Noise (30s)
- **Sample Path**: `C:\marvedge-task53-media\ava\noisy_sample.mp4`
- **Role**: `noisy_speech`
- **Source Duration**: 30.04s
- **Decodability Verdict**: `PASS`
- **File Size**: 4.42 MB (4639271 bytes)
- **Audio Codec**: `aac` (44100 Hz, 2 ch)
- **Peak Volume (dBFS)**: `-8.4 dB` | **Mean Volume**: `-28.5 dB`
- **Leading / Trailing Silence**: `0.00s` leading, `0.00s` trailing
- **Provider Execution**: `BLOCKED` — *Live ElevenLabs call skipped (ELEVENLABS_API_KEY is not configured in local environment; live calls require explicit opt-in to avoid paid provider consumption).*
- **Voice Consistency**: `NOT_VERIFIED` — *Automated voice similarity metric not available in repo; requires human listening evaluation against source speaker timbre.*

### CASE-04: Short Clip Speech (8s public demo asset)
- **Sample Path**: `C:\Users\Shambhavi\OneDrive\Desktop\marvedge\marvedge\public\icons\1.mp4`
- **Role**: `short_speech_tail`
- **Source Duration**: 8.00s
- **Decodability Verdict**: `PASS`
- **File Size**: 2.37 MB (2481389 bytes)
- **Audio Codec**: `aac` (48000 Hz, 2 ch)
- **Peak Volume (dBFS)**: `-6.7 dB` | **Mean Volume**: `-25.0 dB`
- **Leading / Trailing Silence**: `0.00s` leading, `0.00s` trailing
- **Provider Execution**: `BLOCKED` — *Live ElevenLabs call skipped (ELEVENLABS_API_KEY is not configured in local environment; live calls require explicit opt-in to avoid paid provider consumption).*
- **Voice Consistency**: `NOT_VERIFIED` — *Automated voice similarity metric not available in repo; requires human listening evaluation against source speaker timbre.*

### CASE-05: Silent Video Negative Control (15.4s moving subject, no audio)
- **Sample Path**: `C:\marvedge-task53-media\moving_subject\06_moving_subject.mp4`
- **Role**: `silent_negative_control`
- **Source Duration**: 15.45s
- **Decodability Verdict**: `PASS`
- **Negative Control Status**: `PASS` (Verified absent audio stream)
- **File Size**: 3.87 MB (4061421 bytes)
- **Leading / Trailing Silence**: `0.00s` leading, `0.00s` trailing
- **Provider Execution**: `NOT_APPLICABLE` — *Negative control correctly verified: audio stream is absent; skipped sending to dubbing provider.*
- **Voice Consistency**: `NOT_APPLICABLE` — *No speech in silent media.*

---

## 4. Manual Listening Evaluation Rubric

Because automated speaker verification and natural prosody models are not bundled in this codebase, subjective listening review must be executed against the following 5-point checklist before releasing dubbing to end users:

- 1. Voice Naturalness: Does speech flow naturally without mechanical gating or robotic timbre?
- 2. Tail Clipping: Does speech terminate naturally without abrupt clipping of final syllables near video boundaries?
- 3. Dynamic Range & Distortion: Are plosives or loud utterances free of audible harsh clipping/distortion?
- 4. Speaker Identity & Consistency: Does the dubbed voice preserve source gender, age profile, and pitch register?
- 5. Pronunciation & Target Language Accuracy: Are target-language terms and grammatical structure rendered correctly?

---

## 5. Scope & Boundary Constraints

- **Preserved Unrelated Code**: `cloudrun-worker/package-lock.json`, `cloudrun-worker/.dockerignore`, `task-85-bug-bash/`, `task53-results/`, and `types/` were untouched.
- **Safe Excerpting**: The 1.11 GB original `col.mp4` was preserved intact without full-file transmission; testing utilized the 30-second excerpt `col_excerpt_30s.mp4`.
- **No Destructive Operations**: No Git branch switches, commits, pushes, or PR creations were performed.
# Face-Detection Preprocessing Pipeline

> **Task 00007** — Build the face-detection preprocessing step TalkNet needs

This directory contains the standalone preprocessing pipeline that converts a raw input video into the per-speaker face-crop tracks and structured metadata required by TalkNet-ASD.

---

## Pipeline Overview

```
Input Video
    │
    ▼
[1] FFmpeg — re-encode to 25fps AVI, extract mono 16kHz WAV
    │
    ▼
[2] PySceneDetect — segment video into coherent scenes
    │
    ▼
[3] S3FD Face Detector — detect all faces in every frame (confidence > 0.9)
    │
    ▼
[4] IoU Tracker — link per-frame detections into continuous per-person tracks
    │
    ▼
[5] Crop & Pad — extract 224×224 face crops + aligned audio slices per track
    │
    ▼
Output: pycrop/*.avi  +  pycrop/*.wav  +  metadata.json
```

---

## Files

| File | Purpose |
|:-----|:--------|
| `preprocess_faces.py` | Main pipeline — run this to process a video |
| `test_preprocess_faces.py` | Automated validation suite — run after preprocessing |
| `setup_talknet.sh` | One-shot setup script for GPU machines |
| `TalkNet_Colab_Inference.ipynb` | Full end-to-end walkthrough notebook (Google Colab) |

---

## Local Setup (GPU Machine)

```bash
# 1. Clone TalkNet-ASD and install dependencies
bash scripts/ml/setup_talknet.sh

# 2. Activate the virtual environment
cd TalkNet-ASD && source venv/bin/activate

# 3. Run preprocessing on your video
python ../scripts/ml/preprocess_faces.py \
  --videoPath "/path/to/your/video.mp4" \
  --savePath  "./demo_output"

# 4. Validate the output
python ../scripts/ml/test_preprocess_faces.py \
  --outputDir "./demo_output"
```

---

## Docker (Recommended — Zero Setup)

The entire pipeline is containerized in `ml-worker/`. This is the easiest way to run it locally without installing PyTorch, FFmpeg, or any other dependencies.

```bash
cd ml-worker

# Option A: docker compose (recommended)
docker compose up

# Option B: raw docker
docker build -t marvedge-ml-worker .
docker run -p 8080:8080 marvedge-ml-worker
```

Then open **http://localhost:8080**, upload any video, and click **Process Video**.

---

## CLI Reference

```
python preprocess_faces.py --videoPath <path> --savePath <output_dir> [options]

Required:
  --videoPath            Path to the input video file (any format FFmpeg supports)
  --savePath             Directory where all output files will be written

Optional:
  --nDataLoaderThread    FFmpeg thread count (default: 10)
  --facedetScale         S3FD input scale factor, lower = faster (default: 0.25)
  --minTrack             Minimum frames required to keep a track (default: 10)
  --numFailedDet         Missed detection frames before a track is broken (default: 10)
  --minFaceSize          Minimum face bounding box size in px (default: 1)
  --cropScale            How much padding to add around each face crop (default: 0.40)
```

---

## Output Schema

After a successful run, `<savePath>/` contains:

```
<savePath>/
├── metadata.json          ← Machine-readable track index (see schema below)
├── pyavi/
│   ├── video.avi          ← Re-encoded 25fps source video
│   └── audio.wav          ← Full mono 16kHz audio track
├── pyframes/
│   └── *.jpg              ← Individual frames extracted from video.avi
├── pywork/
│   ├── scene.pckl         ← Scene boundary data
│   ├── faces.pckl         ← Raw per-frame face detections
│   └── tracks.pckl        ← Processed track data
└── pycrop/
    ├── 00000.avi           ← 224×224 face-crop video, speaker 0
    ├── 00000.wav           ← Aligned audio slice, speaker 0
    ├── 00001.avi
    ├── 00001.wav
    └── ...
```

### `metadata.json` Schema

```json
{
  "tracks": [
    {
      "track_id":      "00000",
      "start_frame":   42,
      "end_frame":     310,
      "start_time_sec": 1.68,
      "end_time_sec":  12.40,
      "video_path":    "00000.avi",
      "audio_path":    "00000.wav",
      "bbox_history": [
        { "frame": 42, "bbox": [x1, y1, x2, y2] },
        ...
      ]
    }
  ]
}
```

---

## Validation Suite

`test_preprocess_faces.py` runs 6 automated checks after preprocessing:

| # | Test | What it checks |
|:--|:-----|:---------------|
| 1 | Directory structure | All 4 output folders exist |
| 2 | `metadata.json` schema | All required keys present, types correct |
| 3 | Video crop integrity | Each `.avi` opens, is 224×224, runs at 25fps |
| 4 | Audio crop integrity | Each `.wav` is 16kHz, mono, non-empty |
| 5 | Timestamp coherence | `start < end` for all tracks, sec = frame/25 |
| 6 | Cross-file coverage | Every track in metadata has a matching `.avi` + `.wav` on disk |

Exit code `0` = all passed. Exit code `1` = one or more failures.

---

## Known Constraints

- **CPU inference**: The S3FD detector runs on CPU by default in Docker. GPU is ~10× faster for long videos.
- **Minimum track length**: Tracks shorter than `--minTrack` frames are discarded. Increase if you're losing short speakers.
- **Face confidence**: Detections below `0.9` confidence are dropped. Lower `conf_th` in `inference_video()` if faces are being missed.

"""
benchmark_preprocessing.py
--------------------------
Task 00017: Benchmark inference speed and GPU memory usage for the
face-crop preprocessing pipeline (preprocess_faces.py).

Measures per-stage wall-clock time and peak GPU VRAM for:
  1. FFmpeg video/audio/frame extraction
  2. PySceneDetect scene detection
  3. S3FD face detection (GPU-bound)
  4. IoU face tracking
  5. Face crop + audio slice

Outputs a structured JSON report and a human-readable summary table.

Usage (Colab T4):
    python benchmark_preprocessing.py \
        --videoPath demo/test_clip.mp4 \
        --savePath demo/bench_output \
        --reportPath demo/benchmark_report.json
"""

import sys, time, os, tqdm, argparse, glob, subprocess, warnings, json
import cv2, pickle, numpy
from scipy import signal
from shutil import rmtree
from scipy.io import wavfile
from scipy.interpolate import interp1d

from scenedetect.video_manager import VideoManager
from scenedetect.scene_manager import SceneManager
from scenedetect.stats_manager import StatsManager
from scenedetect.detectors import ContentDetector

from model.faceDetector.s3fd import S3FD

warnings.filterwarnings("ignore")

# ── GPU memory helpers ────────────────────────────────────────────────────────
try:
    import torch
    HAS_CUDA = torch.cuda.is_available()
except ImportError:
    HAS_CUDA = False

def gpu_mem_mb():
    """Return current GPU memory allocated in MB, or 0 if no CUDA."""
    if not HAS_CUDA:
        return 0.0
    return torch.cuda.memory_allocated() / (1024 * 1024)

def gpu_peak_mb():
    """Return peak GPU memory allocated in MB since last reset."""
    if not HAS_CUDA:
        return 0.0
    return torch.cuda.max_memory_allocated() / (1024 * 1024)

def gpu_reset_peak():
    """Reset the peak memory tracker."""
    if HAS_CUDA:
        torch.cuda.reset_peak_memory_stats()

def gpu_total_mb():
    """Return total GPU VRAM in MB."""
    if not HAS_CUDA:
        return 0.0
    return torch.cuda.get_device_properties(0).total_memory / (1024 * 1024)


# ── Pipeline stages (same logic as preprocess_faces.py) ───────────────────────
def scene_detect(args):
    videoManager = VideoManager([args.videoFilePath])
    statsManager = StatsManager()
    sceneManager = SceneManager(statsManager)
    sceneManager.add_detector(ContentDetector())
    baseTimecode = videoManager.get_base_timecode()
    videoManager.set_downscale_factor()
    videoManager.start()
    sceneManager.detect_scenes(frame_source=videoManager)
    sceneList = sceneManager.get_scene_list(baseTimecode)
    savePath = os.path.join(args.pyworkPath, 'scene.pckl')
    if sceneList == []:
        sceneList = [(videoManager.get_base_timecode(), videoManager.get_current_timecode())]
    with open(savePath, 'wb') as fil:
        pickle.dump(sceneList, fil)
    return sceneList

def inference_video(args):
    DET = S3FD(device='cuda')
    flist = glob.glob(os.path.join(args.pyframesPath, '*.jpg'))
    flist.sort()
    dets = []
    for fidx, fname in enumerate(flist):
        image = cv2.imread(fname)
        imageNumpy = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        bboxes = DET.detect_faces(imageNumpy, conf_th=0.9, scales=[args.facedetScale])
        dets.append([])
        for bbox in bboxes:
            dets[-1].append({'frame': fidx, 'bbox': (bbox[:-1]).tolist(), 'conf': bbox[-1]})
    savePath = os.path.join(args.pyworkPath, 'faces.pckl')
    with open(savePath, 'wb') as fil:
        pickle.dump(dets, fil)
    return dets

def bb_intersection_over_union(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    iou = interArea / float(boxAArea + boxBArea - interArea)
    return iou

def track_shot(args, sceneFaces):
    iouThres = 0.5
    tracks = []
    while True:
        track = []
        for frameFaces in sceneFaces:
            for face in frameFaces:
                if track == []:
                    track.append(face)
                    frameFaces.remove(face)
                elif face['frame'] - track[-1]['frame'] <= args.numFailedDet:
                    iou = bb_intersection_over_union(face['bbox'], track[-1]['bbox'])
                    if iou > iouThres:
                        track.append(face)
                        frameFaces.remove(face)
                        continue
                else:
                    break
        if track == []:
            break
        elif len(track) > args.minTrack:
            frameNum = numpy.array([f['frame'] for f in track])
            bboxes = numpy.array([numpy.array(f['bbox']) for f in track])
            frameI = numpy.arange(frameNum[0], frameNum[-1] + 1)
            bboxesI = []
            for ij in range(0, 4):
                interpfn = interp1d(frameNum, bboxes[:, ij])
                bboxesI.append(interpfn(frameI))
            bboxesI = numpy.stack(bboxesI, axis=1)
            if max(numpy.mean(bboxesI[:, 2] - bboxesI[:, 0]),
                   numpy.mean(bboxesI[:, 3] - bboxesI[:, 1])) > args.minFaceSize:
                tracks.append({'frame': frameI, 'bbox': bboxesI})
    return tracks

def crop_video(args, track, cropFile):
    flist = glob.glob(os.path.join(args.pyframesPath, '*.jpg'))
    flist.sort()
    vOut = cv2.VideoWriter(cropFile + 't.avi', cv2.VideoWriter_fourcc(*'XVID'), 25, (224, 224))
    dets = {'x': [], 'y': [], 's': []}
    for det in track['bbox']:
        dets['s'].append(max((det[3] - det[1]), (det[2] - det[0])) / 2)
        dets['y'].append((det[1] + det[3]) / 2)
        dets['x'].append((det[0] + det[2]) / 2)
    dets['s'] = signal.medfilt(dets['s'], kernel_size=13)
    dets['x'] = signal.medfilt(dets['x'], kernel_size=13)
    dets['y'] = signal.medfilt(dets['y'], kernel_size=13)
    for fidx, frame in enumerate(track['frame']):
        cs = args.cropScale
        bs = dets['s'][fidx]
        bsi = int(bs * (1 + 2 * cs))
        image = cv2.imread(flist[frame])
        frame_pad = numpy.pad(image, ((bsi, bsi), (bsi, bsi), (0, 0)),
                              'constant', constant_values=(110, 110))
        my = dets['y'][fidx] + bsi
        mx = dets['x'][fidx] + bsi
        
        # Prevent negative indices which cause numpy to slice from the end
        y1 = max(0, int(my - bs))
        y2 = max(0, int(my + bs * (1 + 2 * cs)))
        x1 = max(0, int(mx - bs * (1 + cs)))
        x2 = max(0, int(mx + bs * (1 + cs)))
        
        face = frame_pad[y1:y2, x1:x2]
        
        # Fallback if face is somehow completely out of bounds (empty)
        if face.size == 0:
            face = numpy.zeros((224, 224, 3), dtype=numpy.uint8)
            
        vOut.write(cv2.resize(face, (224, 224)))
    audioTmp = cropFile + '.wav'
    audioStart = (track['frame'][0]) / 25
    audioEnd = (track['frame'][-1] + 1) / 25
    vOut.release()
    command = ("ffmpeg -y -i %s -async 1 -ac 1 -vn -acodec pcm_s16le -ar 16000 "
               "-threads %d -ss %.3f -to %.3f %s -loglevel panic" %
               (args.audioFilePath, args.nDataLoaderThread, audioStart, audioEnd, audioTmp))
    subprocess.call(command, shell=True, stdout=None)
    _, audio = wavfile.read(audioTmp)
    command = ("ffmpeg -y -i %st.avi -i %s -threads %d -c:v copy -c:a copy %s.avi -loglevel panic" %
               (cropFile, audioTmp, args.nDataLoaderThread, cropFile))
    subprocess.call(command, shell=True, stdout=None)
    os.remove(cropFile + 't.avi')
    return {'track': track, 'proc_track': dets}


# ── Benchmark harness ─────────────────────────────────────────────────────────
def timed(label, fn, report):
    """Run fn(), record wall time and GPU peak VRAM into report dict."""
    gpu_reset_peak()
    mem_before = gpu_mem_mb()
    t0 = time.time()
    result = fn()
    elapsed = time.time() - t0
    peak = gpu_peak_mb()

    report["stages"].append({
        "stage": label,
        "wall_time_sec": round(elapsed, 2),
        "gpu_mem_before_mb": round(mem_before, 1),
        "gpu_peak_mb": round(peak, 1),
    })
    sys.stderr.write("  %-25s  %7.2fs  |  GPU peak: %7.1f MB\n" % (label, elapsed, peak))
    return result


def get_video_duration(path):
    """Use ffprobe to get video duration in seconds."""
    try:
        cmd = ("ffprobe -v error -show_entries format=duration "
               "-of default=noprint_wrappers=1:nokey=1 " + path)
        out = subprocess.check_output(cmd, shell=True).decode().strip()
        return float(out)
    except Exception:
        return 0.0


def main():
    parser = argparse.ArgumentParser(description="Benchmark face-crop preprocessing pipeline")
    parser.add_argument('--videoPath', type=str, required=True, help='Path to input video')
    parser.add_argument('--savePath', type=str, required=True, help='Output directory')
    parser.add_argument('--reportPath', type=str, default=None,
                        help='Path to save JSON benchmark report (default: <savePath>/benchmark_report.json)')
    parser.add_argument('--nDataLoaderThread', type=int, default=10)
    parser.add_argument('--facedetScale', type=float, default=0.25)
    parser.add_argument('--minTrack', type=int, default=10)
    parser.add_argument('--numFailedDet', type=int, default=10)
    parser.add_argument('--minFaceSize', type=int, default=1)
    parser.add_argument('--cropScale', type=float, default=0.40)
    args = parser.parse_args()

    if args.reportPath is None:
        args.reportPath = os.path.join(args.savePath, 'benchmark_report.json')

    # ── Report structure ──────────────────────────────────────────────────────
    video_duration = get_video_duration(args.videoPath)
    report = {
        "input_video": os.path.basename(args.videoPath),
        "input_duration_sec": round(video_duration, 2),
        "gpu_name": "",
        "gpu_total_vram_mb": round(gpu_total_mb(), 0),
        "stages": [],
        "total_wall_time_sec": 0,
        "total_frames": 0,
        "fps_throughput": 0,
        "tracks_found": 0,
    }

    if HAS_CUDA:
        report["gpu_name"] = torch.cuda.get_device_name(0)

    # ── Init directories ──────────────────────────────────────────────────────
    args.pyaviPath = os.path.join(args.savePath, 'pyavi')
    args.pyframesPath = os.path.join(args.savePath, 'pyframes')
    args.pyworkPath = os.path.join(args.savePath, 'pywork')
    args.pycropPath = os.path.join(args.savePath, 'pycrop')

    if os.path.exists(args.savePath):
        rmtree(args.savePath)
    for d in [args.pyaviPath, args.pyframesPath, args.pyworkPath, args.pycropPath]:
        os.makedirs(d, exist_ok=True)

    sys.stderr.write("\n" + "=" * 65 + "\n")
    sys.stderr.write("  BENCHMARK: Face-Crop Preprocessing Pipeline\n")
    sys.stderr.write("  Video: %s (%.1fs)\n" % (os.path.basename(args.videoPath), video_duration))
    if HAS_CUDA:
        sys.stderr.write("  GPU:   %s (%.0f MB VRAM)\n" % (report["gpu_name"], report["gpu_total_vram_mb"]))
    sys.stderr.write("=" * 65 + "\n\n")

    t_total = time.time()

    # ── Stage 1: FFmpeg extraction ────────────────────────────────────────────
    args.videoFilePath = os.path.join(args.pyaviPath, 'video.avi')
    args.audioFilePath = os.path.join(args.pyaviPath, 'audio.wav')

    def ffmpeg_extract():
        subprocess.call(
            "ffmpeg -y -i %s -qscale:v 2 -threads %d -async 1 -r 25 %s -loglevel panic" %
            (args.videoPath, args.nDataLoaderThread, args.videoFilePath),
            shell=True, stdout=None)
        subprocess.call(
            "ffmpeg -y -i %s -qscale:a 0 -ac 1 -vn -threads %d -ar 16000 %s -loglevel panic" %
            (args.videoFilePath, args.nDataLoaderThread, args.audioFilePath),
            shell=True, stdout=None)
        subprocess.call(
            "ffmpeg -y -i %s -qscale:v 2 -threads %d -f image2 %s -loglevel panic" %
            (args.videoFilePath, args.nDataLoaderThread,
             os.path.join(args.pyframesPath, '%06d.jpg')),
            shell=True, stdout=None)

    timed("FFmpeg extraction", ffmpeg_extract, report)

    total_frames = len(glob.glob(os.path.join(args.pyframesPath, '*.jpg')))
    report["total_frames"] = total_frames
    sys.stderr.write("  → %d frames extracted at 25 fps\n\n" % total_frames)

    # ── Stage 2: Scene detection ──────────────────────────────────────────────
    scene = timed("Scene detection", lambda: scene_detect(args), report)
    sys.stderr.write("  → %d scenes found\n\n" % len(scene))

    # ── Stage 3: S3FD face detection (GPU) ────────────────────────────────────
    faces = timed("S3FD face detection", lambda: inference_video(args), report)
    sys.stderr.write("\n  → face detection complete\n\n")

    # ── Stage 4: IoU face tracking ────────────────────────────────────────────
    def do_tracking():
        tracks = []
        for shot in scene:
            if shot[1].frame_num - shot[0].frame_num >= args.minTrack:
                tracks.extend(track_shot(args, faces[shot[0].frame_num:shot[1].frame_num]))
        return tracks

    allTracks = timed("IoU face tracking", do_tracking, report)
    report["tracks_found"] = len(allTracks)
    sys.stderr.write("  → %d tracks found\n\n" % len(allTracks))

    # ── Stage 5: Face cropping + audio slice ──────────────────────────────────
    def do_cropping():
        vidTracks = []
        for ii, track in tqdm.tqdm(enumerate(allTracks), total=len(allTracks)):
            vidTracks.append(crop_video(args, track, os.path.join(args.pycropPath, '%05d' % ii)))
        return vidTracks

    vidTracks = timed("Face crop + audio slice", do_cropping, report)

    # ── Totals ────────────────────────────────────────────────────────────────
    total_time = time.time() - t_total
    report["total_wall_time_sec"] = round(total_time, 2)
    report["fps_throughput"] = round(total_frames / total_time, 2) if total_time > 0 else 0
    report["realtime_ratio"] = round(video_duration / total_time, 2) if total_time > 0 else 0

    # ── Summary table ─────────────────────────────────────────────────────────
    sys.stderr.write("\n" + "=" * 65 + "\n")
    sys.stderr.write("  %-25s  %10s  |  %12s\n" % ("STAGE", "TIME", "GPU PEAK"))
    sys.stderr.write("  " + "-" * 55 + "\n")
    for s in report["stages"]:
        sys.stderr.write("  %-25s  %8.2fs  |  %8.1f MB\n" %
                         (s["stage"], s["wall_time_sec"], s["gpu_peak_mb"]))
    sys.stderr.write("  " + "-" * 55 + "\n")
    sys.stderr.write("  %-25s  %8.2fs  |\n" % ("TOTAL", total_time))
    sys.stderr.write("=" * 65 + "\n")
    sys.stderr.write("  Throughput:  %.1f frames/sec  (%.2fx realtime)\n" %
                     (report["fps_throughput"], report["realtime_ratio"]))
    sys.stderr.write("  Video: %.1fs → processed in %.1fs\n" % (video_duration, total_time))
    sys.stderr.write("=" * 65 + "\n")

    # ── Save report ───────────────────────────────────────────────────────────
    with open(args.reportPath, 'w') as f:
        json.dump(report, f, indent=2)
    sys.stderr.write("\nReport saved to %s\n" % args.reportPath)


if __name__ == '__main__':
    main()

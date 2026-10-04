import sys, time, os, tqdm, argparse, glob, subprocess, warnings, cv2, pickle, numpy, json
from scipy import signal
from shutil import rmtree
from scipy.io import wavfile
from scipy.interpolate import interp1d

try:
    from scenedetect.video_manager import VideoManager
    from scenedetect.scene_manager import SceneManager
    from scenedetect.stats_manager import StatsManager
    from scenedetect.detectors import ContentDetector
except ImportError:
    VideoManager = SceneManager = StatsManager = ContentDetector = None

try:
    from model.faceDetector.s3fd import S3FD
except ImportError:
    S3FD = None

warnings.filterwarnings("ignore")

TARGET_FPS = 25
def scene_detect(args):
    videoManager = VideoManager([args.videoFilePath])
    statsManager = StatsManager()
    sceneManager = SceneManager(statsManager)
    sceneManager.add_detector(ContentDetector())
    baseTimecode = videoManager.get_base_timecode()
    videoManager.set_downscale_factor()
    videoManager.start()
    sceneManager.detect_scenes(frame_source = videoManager)
    sceneList = sceneManager.get_scene_list(baseTimecode)
    savePath = os.path.join(args.pyworkPath, 'scene.pckl')
    if sceneList == []:
        sceneList = [(videoManager.get_base_timecode(),videoManager.get_current_timecode())]
    with open(savePath, 'wb') as fil:
        pickle.dump(sceneList, fil)
        sys.stderr.write('%s - scenes detected %d\n'%(args.videoFilePath, len(sceneList)))
    return sceneList

def inference_video(args):
    try:
        import torch
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
    except ImportError:
        device = 'cpu'
    DET = S3FD(device=device)
    flist = glob.glob(os.path.join(args.pyframesPath, '*.jpg'))
    flist.sort()

    dets = []

    import numpy as np
    from model.faceDetector.s3fd.box_utils import nms_
    img_mean = np.array([104., 117., 123.])[:, np.newaxis, np.newaxis].astype('float32')

    # Process the video in large memory-safe chunks (to avoid loading 10s of thousands of images into RAM)
    chunk_size = args.chunkSize
    batch_size = args.batchSize

    for chunk_start in range(0, len(flist), chunk_size):
        chunk_files = flist[chunk_start : chunk_start + chunk_size]

        # Load all images in the chunk
        chunk_images = []
        for fname in chunk_files:
            image = cv2.imread(fname)
            if image is not None:
                chunk_images.append(image)

        if not chunk_images:
            for _ in chunk_files:
                dets.append([])
            continue

        # We assume all frames are the same size for a given video
        h, w = chunk_images[0].shape[0], chunk_images[0].shape[1]
        scale_t = torch.Tensor([w, h, w, h]).to(device) if device == 'cuda' else torch.Tensor([w, h, w, h])

        # S3FD preprocessing
        processed_tensors = []
        for img in chunk_images:
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            s = args.facedetScale
            scaled_img = cv2.resize(img_rgb, dsize=(0, 0), fx=s, fy=s, interpolation=cv2.INTER_LINEAR)
            scaled_img = np.swapaxes(scaled_img, 1, 2)
            scaled_img = np.swapaxes(scaled_img, 1, 0)
            scaled_img = scaled_img[[2, 1, 0], :, :]
            scaled_img = scaled_img.astype('float32')
            scaled_img -= img_mean
            scaled_img = scaled_img[[2, 1, 0], :, :]
            processed_tensors.append(torch.from_numpy(scaled_img))

        all_tensors = torch.stack(processed_tensors)

        with torch.no_grad():
            for b_start in range(0, len(all_tensors), batch_size):
                batch_tensors = all_tensors[b_start : b_start + batch_size].to(device)

                y = DET.net(batch_tensors)
                detections = y.data

                for b_idx in range(detections.size(0)):
                    bboxes = np.empty(shape=(0, 5))
                    for i in range(detections.size(1)):
                        j = 0
                        while detections[b_idx, i, j, 0] > 0.9:
                            score = detections[b_idx, i, j, 0].item()
                            pt = (detections[b_idx, i, j, 1:] * scale_t).cpu().numpy()
                            bbox = (pt[0], pt[1], pt[2], pt[3], score)
                            bboxes = np.vstack((bboxes, bbox))
                            j += 1

                    if len(bboxes) > 0:
                        keep = nms_(bboxes, 0.1)
                        bboxes = bboxes[keep]

                    frame_idx = chunk_start + b_start + b_idx
                    frame_dets = []
                    for bbox in bboxes:
                        frame_dets.append({
                            'frame': frame_idx,
                            'bbox': (bbox[:-1]).tolist(),
                            'conf': bbox[-1]
                        })
                    dets.append(frame_dets)

        sys.stderr.write(f'{args.videoFilePath} - Processed chunk {chunk_start}/{len(flist)} frames\r')

    sys.stderr.write('\n')
    savePath = os.path.join(args.pyworkPath,'faces.pckl')
    with open(savePath, 'wb') as fil:
        pickle.dump(dets, fil)
    return dets

def bb_intersection_over_union(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = max(0, (boxA[2] - boxA[0])) * max(0, (boxA[3] - boxA[1]))
    boxBArea = max(0, (boxB[2] - boxB[0])) * max(0, (boxB[3] - boxB[1]))
    denom = float(boxAArea + boxBArea - interArea)
    if denom <= 0:
        return 0.0
    iou = interArea / denom
    return iou

def track_shot(args, sceneFaces):
    """
    Multi-target face tracking across frames in a single shot.

    Robust against:
    - Multi-speaker scenarios: non-destructive matching assigns each face
      exclusively to its best matching active track via greedy IoU association.
    - Zero/degenerate bounding boxes via hardened bb_intersection_over_union.
    - Interpolation crashes by enforcing len(track) >= 2 before interp1d.
    - Duplicate/flickering detections through exclusive per-frame assignment.
    """
    iouThres = 0.5
    active_tracks = []
    completed_tracks = []

    base_frame = None
    for f_idx, ffaces in enumerate(sceneFaces):
        if len(ffaces) > 0:
            base_frame = ffaces[0]['frame'] - f_idx
            break

    for f_idx, frameFaces in enumerate(sceneFaces):
        curr_frame = (base_frame + f_idx) if base_frame is not None else f_idx

        still_active = []
        for trk in active_tracks:
            if curr_frame - trk[-1]['frame'] > args.numFailedDet:
                completed_tracks.append(trk)
            else:
                still_active.append(trk)
        active_tracks = still_active

        if len(frameFaces) == 0:
            continue

        matches = []
        for t_idx, trk in enumerate(active_tracks):
            last_bbox = trk[-1]['bbox']
            for d_idx, face in enumerate(frameFaces):
                iou = bb_intersection_over_union(face['bbox'], last_bbox)
                if iou > iouThres:
                    matches.append((iou, t_idx, d_idx))

        matches.sort(key=lambda x: x[0], reverse=True)

        assigned_tracks = set()
        assigned_dets = set()

        for iou, t_idx, d_idx in matches:
            if t_idx not in assigned_tracks and d_idx not in assigned_dets:
                active_tracks[t_idx].append(frameFaces[d_idx])
                assigned_tracks.add(t_idx)
                assigned_dets.add(d_idx)

        for d_idx, face in enumerate(frameFaces):
            if d_idx not in assigned_dets:
                active_tracks.append([face])

    completed_tracks.extend(active_tracks)

    tracks = []
    for raw_track in completed_tracks:
        if len(raw_track) <= args.minTrack or len(raw_track) < 2:
            continue

        frameNum = numpy.array([f['frame'] for f in raw_track])
        bboxes = numpy.array([numpy.array(f['bbox']) for f in raw_track])

        if len(numpy.unique(frameNum)) != len(frameNum):
            unique_frames, unique_indices = numpy.unique(frameNum, return_index=True)
            frameNum = unique_frames
            bboxes = bboxes[unique_indices]
            if len(frameNum) <= args.minTrack or len(frameNum) < 2:
                continue

        frameI = numpy.arange(frameNum[0], frameNum[-1] + 1)
        bboxesI = []

        for ij in range(0, 4):
            interpfn = interp1d(frameNum, bboxes[:, ij])
            bboxesI.append(interpfn(frameI))

        bboxesI = numpy.stack(bboxesI, axis=1)

        mean_w = numpy.mean(bboxesI[:, 2] - bboxesI[:, 0])
        mean_h = numpy.mean(bboxesI[:, 3] - bboxesI[:, 1])

        if max(mean_w, mean_h) > args.minFaceSize:
            tracks.append({
                'frame': frameI,
                'bbox': bboxesI,
                'is_fallback': False,
                'fallback_reason': None
            })

    tracks.sort(key=lambda x: x['frame'][0])
    return tracks


def center_crop_fallback(args, scene_start_frame, scene_end_frame):
    """Emit a synthetic center-crop track when no faces are detected in a scene."""
    n_frames = scene_end_frame - scene_start_frame
    if n_frames < args.minTrack:
        return None
    flist = glob.glob(os.path.join(args.pyframesPath, '*.jpg'))
    flist.sort()
    H, W = 720, 1280
    if flist:
        probe = cv2.imread(flist[min(scene_start_frame, len(flist) - 1)])
        if probe is not None:
            H, W = probe.shape[:2]
    pad = 0.33
    x1, y1 = int(W*(0.5-pad/2)), int(H*(0.5-pad/2))
    x2, y2 = int(W*(0.5+pad/2)), int(H*(0.5+pad/2))
    frames = numpy.arange(scene_start_frame, scene_end_frame)
    bboxes = numpy.tile(numpy.array([x1,y1,x2,y2], dtype=float), (len(frames),1))
    sys.stderr.write(
        f'[FALLBACK] No face in frames {scene_start_frame}–{scene_end_frame}. '
        f'Center-crop track emitted ({x1},{y1},{x2},{y2}).\n'
    )
    return {'frame':frames,'bbox':bboxes,'is_fallback':True,'fallback_reason':'no_face_detected'}

def crop_video(args, track, cropFile, flist=None):
    if flist is None:
        flist = glob.glob(os.path.join(args.pyframesPath, '*.jpg'))
        flist.sort()

    vOut = cv2.VideoWriter(
        cropFile + 't.avi',
        cv2.VideoWriter_fourcc(*'XVID'),
        TARGET_FPS,
        (224, 224)
    )

    dets = {'x': [], 'y': [], 's': []}

    for det in track['bbox']:
        dets['s'].append(max((det[3] - det[1]), (det[2] - det[0])) / 2)
        dets['y'].append((det[1] + det[3]) / 2)
        dets['x'].append((det[0] + det[2]) / 2)

    # Kernel size for medfilt must be odd and <= len(dets)
    k_size = min(13, len(dets['s']))
    if k_size % 2 == 0:
        k_size -= 1

    if k_size >= 3:
        dets['s'] = signal.medfilt(dets['s'], kernel_size=k_size)
        dets['x'] = signal.medfilt(dets['x'], kernel_size=k_size)
        dets['y'] = signal.medfilt(dets['y'], kernel_size=k_size)

    for fidx, frame in enumerate(track['frame']):
        cs = args.cropScale
        bs = dets['s'][fidx]
        bsi = int(bs * (1 + 2 * cs))

        # Frame bounds and read guard
        if frame < 0 or frame >= len(flist):
            face = numpy.zeros((224, 224, 3), dtype=numpy.uint8)
            vOut.write(face)
            continue

        image = cv2.imread(flist[frame])
        if image is None:
            face = numpy.zeros((224, 224, 3), dtype=numpy.uint8)
            vOut.write(face)
            continue

        frame_pad = numpy.pad(
            image,
            ((bsi, bsi), (bsi, bsi), (0, 0)),
            'constant',
            constant_values=(110, 110)
        )

        my = dets['y'][fidx] + bsi
        mx = dets['x'][fidx] + bsi
        H, W = frame_pad.shape[:2]
        y1 = max(0, int(my-bs))
        y2 = max(0, min(H, int(my+bs*(1+2*cs))))
        x1 = max(0, int(mx-bs*(1+cs)))
        x2 = max(0, min(W, int(mx+bs*(1+cs))))

        if y2 <= y1 or x2 <= x1:
            face = numpy.zeros((224, 224, 3), dtype=numpy.uint8)
        else:
            face = frame_pad[y1:y2, x1:x2]
            face = cv2.resize(face, (224, 224))

        vOut.write(face)

    audioTmp = cropFile + '.wav'
    audioStart = (track['frame'][0]) / TARGET_FPS
    audioEnd = (track['frame'][-1] + 1) / TARGET_FPS
    vOut.release()

    cmd_audio = [
        "ffmpeg", "-y",
        "-i", args.audioFilePath,
        "-async", "1",
        "-ac", "1",
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-threads", str(args.nDataLoaderThread),
        "-ss", f"{audioStart:.3f}",
        "-to", f"{audioEnd:.3f}",
        audioTmp,
        "-loglevel", "panic"
    ]
    subprocess.run(cmd_audio, check=True)

    cmd_mux = [
        "ffmpeg", "-y",
        "-i", f"{cropFile}t.avi",
        "-i", audioTmp,
        "-threads", str(args.nDataLoaderThread),
        "-c:v", "copy",
        "-c:a", "copy",
        f"{cropFile}.avi",
        "-loglevel", "panic"
    ]
    subprocess.run(cmd_mux, check=True)

    temp_avi = cropFile + 't.avi'
    if os.path.exists(temp_avi):
        os.remove(temp_avi)
    return {
        'track': track,
        'proc_track': dets,
        'is_fallback': track.get('is_fallback', False),
        'fallback_reason': track.get('fallback_reason', None),
    }
    return {'track': track, 'proc_track': dets}

def generate_metadata(vidTracks, args):
    metadata = {"tracks": []}
    for ii, track in enumerate(vidTracks):
        frames = track['track']['frame'].tolist()
        bboxes = track['track']['bbox'].tolist()
        is_fallback     = track.get('is_fallback', False)
        fallback_reason = track.get('fallback_reason', None)
        metadata["tracks"].append({
            "track_id": f"{ii:05d}",
            "start_frame": int(frames[0]),
            "end_frame": int(frames[-1]),
            "start_time_sec": float(frames[0]) / float(TARGET_FPS),
            "end_time_sec": float(frames[-1]) / float(TARGET_FPS),
            "video_path": f"{ii:05d}.avi",
            "audio_path": f"{ii:05d}.wav",
            "is_fallback": is_fallback,
            "fallback_reason": fallback_reason,
            "bbox_history": [
                {"frame": int(f), "bbox": [float(b) for b in bbox]}
                for f, bbox in zip(frames, bboxes)
            ]
        })
    meta_path = os.path.join(args.savePath, 'metadata.json')
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=4)
    sys.stderr.write(f"Metadata saved to {meta_path}\n")

def main():
    parser = argparse.ArgumentParser(description = "TalkNet Preprocessing ONLY (Face Cropping)")
    parser.add_argument('--videoPath', type=str, required=True, help='Path to input video')
    parser.add_argument('--savePath', type=str, required=True, help='Path to output directory for crops/metadata')

    # Tuning params
    parser.add_argument('--nDataLoaderThread', type=int, default=10, help='Number of workers')
    parser.add_argument('--facedetScale', type=float, default=0.25, help='Scale factor for face detection')
    parser.add_argument('--minTrack', type=int, default=10, help='Number of min frames for each shot')
    parser.add_argument('--numFailedDet', type=int, default=10, help='Missed detections allowed before tracking stopped')
    parser.add_argument('--minFaceSize', type=int, default=1, help='Minimum face size in pixels')
    parser.add_argument('--cropScale', type=float, default=0.40, help='Scale bounding box')
    parser.add_argument('--chunkSize', type=int, default=1000, help='Number of frames to load into RAM at once')
    parser.add_argument('--batchSize', type=int, default=32, help='Batch size for S3FD PyTorch inference on GPU')
    args = parser.parse_args()

    # Initialization
    args.pyaviPath = os.path.join(args.savePath, 'pyavi')
    args.pyframesPath = os.path.join(args.savePath, 'pyframes')
    args.pyworkPath = os.path.join(args.savePath, 'pywork')
    args.pycropPath = os.path.join(args.savePath, 'pycrop')

    if os.path.exists(args.savePath):
        rmtree(args.savePath)
    os.makedirs(args.pyaviPath, exist_ok = True)
    os.makedirs(args.pyframesPath, exist_ok = True)
    os.makedirs(args.pyworkPath, exist_ok = True)
    os.makedirs(args.pycropPath, exist_ok = True)

    args.videoFilePath = os.path.join(args.pyaviPath, 'video.avi')
    cmd_video = [
        "ffmpeg", "-y",
        "-i", args.videoPath,
        "-qscale:v", "2",
        "-threads", str(args.nDataLoaderThread),
        "-async", "1",
        "-r", str(TARGET_FPS),
        args.videoFilePath,
        "-loglevel", "panic"
    ]
    subprocess.run(cmd_video, check=True)
    sys.stderr.write(time.strftime("%Y-%m-%d %H:%M:%S") + " Extract the video and save in %s \r\n" %(args.videoFilePath))

    args.audioFilePath = os.path.join(args.pyaviPath, 'audio.wav')
    cmd_audio = [
        "ffmpeg", "-y",
        "-i", args.videoFilePath,
        "-qscale:a", "0",
        "-ac", "1",
        "-vn",
        "-threads", str(args.nDataLoaderThread),
        "-ar", "16000",
        args.audioFilePath,
        "-loglevel", "panic"
    ]
    subprocess.run(cmd_audio, check=True)
    sys.stderr.write(time.strftime("%Y-%m-%d %H:%M:%S") + " Extract the audio and save in %s \r\n" %(args.audioFilePath))

    cmd_frames = [
        "ffmpeg", "-y",
        "-i", args.videoFilePath,
        "-qscale:v", "2",
        "-threads", str(args.nDataLoaderThread),
        "-f", "image2",
        os.path.join(args.pyframesPath, '%06d.jpg'),
        "-loglevel", "panic"
    ]
    subprocess.run(cmd_frames, check=True)
    sys.stderr.write(time.strftime("%Y-%m-%d %H:%M:%S") + " Extract the frames and save in %s \r\n" %(args.pyframesPath))

    scene = scene_detect(args)
    sys.stderr.write(time.strftime("%Y-%m-%d %H:%M:%S") + " Scene detection and save in %s \r\n" %(args.pyworkPath))

    faces = inference_video(args)
    sys.stderr.write(time.strftime("%Y-%m-%d %H:%M:%S") + " Face detection and save in %s \r\n" %(args.pyworkPath))

    allTracks, vidTracks = [], []
    for shot in scene:
        shot_start = shot[0].frame_num
        shot_end   = shot[1].frame_num
        if shot_end - shot_start >= args.minTrack:
            shot_tracks = track_shot(args, faces[shot_start:shot_end])
            if shot_tracks:
                allTracks.extend(shot_tracks)
            else:
                fb = center_crop_fallback(args, shot_start, shot_end)
                if fb is not None:
                    allTracks.append(fb)
    sys.stderr.write(
        time.strftime("%Y-%m-%d %H:%M:%S") +
        " Face track and detected %d tracks (%d fallback) \r\n" % (
            len(allTracks),
            sum(1 for t in allTracks if t.get('is_fallback', False))
        )
    )

    flist = glob.glob(os.path.join(args.pyframesPath, '*.jpg'))
    flist.sort()
    for ii, track in tqdm.tqdm(enumerate(allTracks), total = len(allTracks)):
        vidTracks.append(crop_video(args, track, os.path.join(args.pycropPath, '%05d'%ii), flist=flist))

    savePath = os.path.join(args.pyworkPath, 'tracks.pckl')
    with open(savePath, 'wb') as fil:
        pickle.dump(vidTracks, fil)

    generate_metadata(vidTracks, args)

    sys.stderr.write("\n=== Preprocessing Complete ===\n")
    sys.stderr.write(f"Outputs saved to: {args.savePath}\n")

if __name__ == '__main__':
    main()

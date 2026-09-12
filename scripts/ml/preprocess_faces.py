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
    for fidx, fname in enumerate(flist):
        image = cv2.imread(fname)
        dets.append([])
        if image is None:
            continue
        imageNumpy = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        bboxes = DET.detect_faces(imageNumpy, conf_th=0.9, scales=[args.facedetScale])
        for bbox in bboxes:
          dets[-1].append({'frame':fidx, 'bbox':(bbox[:-1]).tolist(), 'conf':bbox[-1]}) 
        sys.stderr.write('%s-%05d; %d dets\r' % (args.videoFilePath, fidx, len(dets[-1])))
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

    # Determine baseline frame index if sceneFaces has non-empty frames
    base_frame = None
    for f_idx, ffaces in enumerate(sceneFaces):
        if len(ffaces) > 0:
            base_frame = ffaces[0]['frame'] - f_idx
            break

    for f_idx, frameFaces in enumerate(sceneFaces):
        curr_frame = (base_frame + f_idx) if base_frame is not None else f_idx

        # Retire active tracks that have exceeded numFailedDet
        still_active = []
        for trk in active_tracks:
            if curr_frame - trk[-1]['frame'] > args.numFailedDet:
                completed_tracks.append(trk)
            else:
                still_active.append(trk)
        active_tracks = still_active

        if len(frameFaces) == 0:
            continue

        # Greedy bipartite matching between active tracks and current frame faces
        matches = []
        for t_idx, trk in enumerate(active_tracks):
            last_bbox = trk[-1]['bbox']
            for d_idx, face in enumerate(frameFaces):
                iou = bb_intersection_over_union(face['bbox'], last_bbox)
                if iou > iouThres:
                    matches.append((iou, t_idx, d_idx))

        # Sort candidate matches by highest IoU first
        matches.sort(key=lambda x: x[0], reverse=True)

        assigned_tracks = set()
        assigned_dets = set()

        for iou, t_idx, d_idx in matches:
            if t_idx not in assigned_tracks and d_idx not in assigned_dets:
                active_tracks[t_idx].append(frameFaces[d_idx])
                assigned_tracks.add(t_idx)
                assigned_dets.add(d_idx)

        # Unmatched faces in this frame initiate new candidate tracks
        for d_idx, face in enumerate(frameFaces):
            if d_idx not in assigned_dets:
                active_tracks.append([face])

    # Collect all remaining active tracks
    completed_tracks.extend(active_tracks)

    tracks = []
    for raw_track in completed_tracks:
        if len(raw_track) <= args.minTrack or len(raw_track) < 2:
            continue

        frameNum = numpy.array([f['frame'] for f in raw_track])
        bboxes = numpy.array([numpy.array(f['bbox']) for f in raw_track])

        # Ensure frame numbers are strictly monotonically increasing (deduplicate if needed)
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
            tracks.append({'frame': frameI, 'bbox': bboxesI})

    # Sort tracks chronologically by start frame
    tracks.sort(key=lambda x: x['frame'][0])
    return tracks

def crop_video(args, track, cropFile, flist=None):
    if flist is None:
        flist = glob.glob(os.path.join(args.pyframesPath, '*.jpg')) 
        flist.sort()
    vOut = cv2.VideoWriter(cropFile + 't.avi', cv2.VideoWriter_fourcc(*'XVID'), TARGET_FPS, (224, 224))
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

        frame_pad = numpy.pad(image, ((bsi, bsi), (bsi, bsi), (0, 0)), 'constant', constant_values=(110, 110))
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
    return {'track': track, 'proc_track': dets}

def generate_metadata(vidTracks, args):
    metadata = {"tracks": []}
    for ii, track in enumerate(vidTracks):
        # Convert NumPy arrays to Python lists for JSON serialization
        frames = track['track']['frame'].tolist()
        bboxes = track['track']['bbox'].tolist()
        
        metadata["tracks"].append({
            "track_id": f"{ii:05d}",
            "start_frame": int(frames[0]),
            "end_frame": int(frames[-1]),
            "start_time_sec": float(frames[0]) / float(TARGET_FPS),
            "end_time_sec": float(frames[-1]) / float(TARGET_FPS),
            "video_path": f"{ii:05d}.avi",
            "audio_path": f"{ii:05d}.wav",
            "bbox_history": [
                {
                    "frame": int(f),
                    "bbox": [float(b) for b in bbox]
                } for f, bbox in zip(frames, bboxes)
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
        if shot[1].frame_num - shot[0].frame_num >= args.minTrack:
            allTracks.extend(track_shot(args, faces[shot[0].frame_num:shot[1].frame_num]))
    sys.stderr.write(time.strftime("%Y-%m-%d %H:%M:%S") + " Face track and detected %d tracks \r\n" %len(allTracks))

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

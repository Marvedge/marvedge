import sys, time, os, tqdm, argparse, glob, subprocess, warnings, cv2, pickle, numpy, json
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
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    iou = interArea / float(boxAArea + boxBArea - interArea)
    return iou

def track_shot(args, sceneFaces):
    iouThres  = 0.5
    tracks    = []
    while True:
        track     = []
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
            frameNum    = numpy.array([ f['frame'] for f in track ])
            bboxes      = numpy.array([numpy.array(f['bbox']) for f in track])
            frameI      = numpy.arange(frameNum[0],frameNum[-1]+1)
            bboxesI    = []
            for ij in range(0,4):
                interpfn  = interp1d(frameNum, bboxes[:,ij])
                bboxesI.append(interpfn(frameI))
            bboxesI  = numpy.stack(bboxesI, axis=1)
            if max(numpy.mean(bboxesI[:,2]-bboxesI[:,0]), numpy.mean(bboxesI[:,3]-bboxesI[:,1])) > args.minFaceSize:
                tracks.append({'frame':frameI,'bbox':bboxesI})
    return tracks

def crop_video(args, track, cropFile):
    flist = glob.glob(os.path.join(args.pyframesPath, '*.jpg')) 
    flist.sort()
    vOut = cv2.VideoWriter(cropFile + 't.avi', cv2.VideoWriter_fourcc(*'XVID'), 25, (224,224))
    dets = {'x':[], 'y':[], 's':[]}
    for det in track['bbox']: 
        dets['s'].append(max((det[3]-det[1]), (det[2]-det[0]))/2) 
        dets['y'].append((det[1]+det[3])/2) 
        dets['x'].append((det[0]+det[2])/2) 
    dets['s'] = signal.medfilt(dets['s'], kernel_size=13)  
    dets['x'] = signal.medfilt(dets['x'], kernel_size=13)
    dets['y'] = signal.medfilt(dets['y'], kernel_size=13)
    for fidx, frame in enumerate(track['frame']):
        cs  = args.cropScale
        bs  = dets['s'][fidx]   
        bsi = int(bs * (1 + 2 * cs))   
        image = cv2.imread(flist[frame])
        frame_pad = numpy.pad(image, ((bsi,bsi), (bsi,bsi), (0, 0)), 'constant', constant_values=(110, 110))
        my  = dets['y'][fidx] + bsi  
        mx  = dets['x'][fidx] + bsi  
        
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
    audioTmp    = cropFile + '.wav'
    audioStart  = (track['frame'][0]) / 25
    audioEnd    = (track['frame'][-1]+1) / 25
    vOut.release()
    command = ("ffmpeg -y -i %s -async 1 -ac 1 -vn -acodec pcm_s16le -ar 16000 -threads %d -ss %.3f -to %.3f %s -loglevel panic" % \
              (args.audioFilePath, args.nDataLoaderThread, audioStart, audioEnd, audioTmp)) 
    subprocess.call(command, shell=True, stdout=None)
    _, audio = wavfile.read(audioTmp)
    command = ("ffmpeg -y -i %st.avi -i %s -threads %d -c:v copy -c:a copy %s.avi -loglevel panic" % \
              (cropFile, audioTmp, args.nDataLoaderThread, cropFile))
    subprocess.call(command, shell=True, stdout=None)
    os.remove(cropFile + 't.avi')
    return {'track':track, 'proc_track':dets}

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
            "start_time_sec": float(frames[0]) / 25.0,
            "end_time_sec": float(frames[-1]) / 25.0,
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
    command = ("ffmpeg -y -i %s -qscale:v 2 -threads %d -async 1 -r 25 %s -loglevel panic" % \
        (args.videoPath, args.nDataLoaderThread, args.videoFilePath))
    subprocess.call(command, shell=True, stdout=None)
    sys.stderr.write(time.strftime("%Y-%m-%d %H:%M:%S") + " Extract the video and save in %s \r\n" %(args.videoFilePath))
    
    args.audioFilePath = os.path.join(args.pyaviPath, 'audio.wav')
    command = ("ffmpeg -y -i %s -qscale:a 0 -ac 1 -vn -threads %d -ar 16000 %s -loglevel panic" % \
        (args.videoFilePath, args.nDataLoaderThread, args.audioFilePath))
    subprocess.call(command, shell=True, stdout=None)
    sys.stderr.write(time.strftime("%Y-%m-%d %H:%M:%S") + " Extract the audio and save in %s \r\n" %(args.audioFilePath))

    command = ("ffmpeg -y -i %s -qscale:v 2 -threads %d -f image2 %s -loglevel panic" % \
        (args.videoFilePath, args.nDataLoaderThread, os.path.join(args.pyframesPath, '%06d.jpg'))) 
    subprocess.call(command, shell=True, stdout=None)
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

    for ii, track in tqdm.tqdm(enumerate(allTracks), total = len(allTracks)):
        vidTracks.append(crop_video(args, track, os.path.join(args.pycropPath, '%05d'%ii)))
    
    savePath = os.path.join(args.pyworkPath, 'tracks.pckl')
    with open(savePath, 'wb') as fil:
        pickle.dump(vidTracks, fil)
    
    generate_metadata(vidTracks, args)
    
    sys.stderr.write("\n=== Preprocessing Complete ===\n")
    sys.stderr.write(f"Outputs saved to: {args.savePath}\n")

if __name__ == '__main__':
    main()

import cv2
import numpy as np
import argparse
import os
import json
from tqdm import tqdm

def load_templates(template_dir):
    templates = []
    target_cursors = {"default.png", "default@2x.png", "handpointing.png"}
    
    if not os.path.exists(template_dir):
        return templates
        
    for fname in os.listdir(template_dir):
        if fname in target_cursors:
            path = os.path.join(template_dir, fname)
            img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
            if img is not None:
                # Extract edges from the template
                if img.shape[-1] == 4:
                    mask = img[:, :, 3]
                    gray = cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2GRAY)
                    gray = cv2.bitwise_and(gray, gray, mask=mask)
                else:
                    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                
                edges = cv2.Canny(gray, 50, 150)
                templates.append((fname, edges))
    return templates

def detect_cursor_in_frame(frame, templates, threshold=0.55, scales=[0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0]):
    gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    frame_edges = cv2.Canny(gray_frame, 50, 150)
    
    best_val = -1
    best_loc = None
    best_w, best_h = 0, 0
    
    for name, template_edges in templates:
        for scale in scales:
            width = int(template_edges.shape[1] * scale)
            height = int(template_edges.shape[0] * scale)
            if width > frame_edges.shape[1] or height > frame_edges.shape[0] or width == 0 or height == 0:
                continue
                
            resized_edges = cv2.resize(template_edges, (width, height))
            
            res = cv2.matchTemplate(frame_edges, resized_edges, cv2.TM_CCOEFF_NORMED)
            min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
            
            if max_val > best_val:
                best_val = max_val
                if max_val >= threshold:
                    best_loc = max_loc
                    best_w, best_h = width, height
                
    if best_loc is not None:
        return {
            "x": best_loc[0],
            "y": best_loc[1],
            "w": best_w,
            "h": best_h,
            "confidence": float(best_val)
        }
    return None

def process_video(video_path, template_dir, output_path, threshold=0.55, frame_skip=5, max_frames=None):
    templates = load_templates(template_dir)
    if not templates:
        print("No templates found. Exiting.")
        return
        
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    results = {
        "video": video_path,
        "fps": fps,
        "frames": {}
    }
    
    limit = min(total_frames, max_frames if max_frames else total_frames)
    print(f"Detecting cursor in {video_path} using Edge Matching...")
    
    # Process only every Nth frame for massive speedup
    for frame_idx in tqdm(range(0, limit, frame_skip)):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            break
            
        det = detect_cursor_in_frame(frame, templates, threshold=threshold)
        if det:
            results["frames"][frame_idx] = det
            
    cap.release()
    
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"Cursor track saved to {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--templates", default="cursor_templates")
    parser.add_argument("--output", default="cursor_track.json")
    parser.add_argument("--threshold", type=float, default=0.55)
    parser.add_argument("--skip", type=int, default=5)
    parser.add_argument("--max_frames", type=int, default=None)
    
    args = parser.parse_args()
    process_video(args.video, args.templates, args.output, args.threshold, args.skip, args.max_frames)

import cv2
import numpy as np
import argparse
import os
import json
from tqdm import tqdm

def load_templates(template_dir):
    templates = []
    # Only load the most common cursors to save massive amount of CPU time
    target_cursors = {"default.png", "default@2x.png", "handpointing.png", "handpointing@2x.png"}
    
    if not os.path.exists(template_dir):
        print(f"Warning: Template directory {template_dir} not found.")
        return templates
        
    for fname in os.listdir(template_dir):
        if fname in target_cursors:
            path = os.path.join(template_dir, fname)
            img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
            if img is not None:
                templates.append((fname, img))
    return templates

def detect_cursor_in_frame(frame, templates, threshold=0.7, scales=[0.5, 1.0, 1.5]):
    gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    best_val = -1
    best_loc = None
    best_w, best_h = 0, 0
    
    for name, template in templates:
        mask = None
        if template.shape[-1] == 4:
            mask = template[:, :, 3]
            template_bgr = template[:, :, :3]
            template_gray = cv2.cvtColor(template_bgr, cv2.COLOR_BGR2GRAY)
        else:
            template_gray = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)
            
        for scale in scales:
            width = int(template_gray.shape[1] * scale)
            height = int(template_gray.shape[0] * scale)
            if width > gray_frame.shape[1] or height > gray_frame.shape[0] or width == 0 or height == 0:
                continue
                
            resized_template = cv2.resize(template_gray, (width, height))
            resized_mask = cv2.resize(mask, (width, height)) if mask is not None else None
            
            if resized_mask is not None:
                # Binarize mask for safety
                _, resized_mask = cv2.threshold(resized_mask, 127, 255, cv2.THRESH_BINARY)
                res = cv2.matchTemplate(gray_frame, resized_template, cv2.TM_CCORR_NORMED, mask=resized_mask)
            else:
                res = cv2.matchTemplate(gray_frame, resized_template, cv2.TM_CCOEFF_NORMED)
                
            min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
            
            if max_val > best_val and max_val >= threshold:
                best_val = max_val
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

def process_video(video_path, template_dir, output_path, threshold=0.4, frame_skip=2, max_frames=None):
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
    
    print(f"Detecting cursor in {video_path} (processing 1 in every {frame_skip} frames for speed)...")
    
    # Process only every Nth frame for massive speedup
    for frame_idx in tqdm(range(0, min(total_frames, max_frames if max_frames else total_frames), frame_skip)):
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
    parser = argparse.ArgumentParser(description="Multi-scale OpenCV template matching for cursor detection.")
    parser.add_argument("--video", required=True, help="Path to input video")
    parser.add_argument("--templates", default="cursor_templates", help="Directory containing cursor PNGs")
    parser.add_argument("--output", default="cursor_track.json", help="Output JSON path")
    parser.add_argument("--threshold", type=float, default=0.4, help="Confidence threshold")
    parser.add_argument("--skip", type=int, default=2, help="Process every Nth frame")
    parser.add_argument("--max_frames", type=int, default=None, help="Stop after N frames for quick testing")
    
    args = parser.parse_args()
    
    process_video(args.video, args.templates, args.output, args.threshold, args.skip, args.max_frames)

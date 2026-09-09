import cv2
import numpy as np
import argparse
import os
import json
from tqdm import tqdm

def load_templates(template_dir):
    templates = []
    # Load all PNG files in the template directory
    if not os.path.exists(template_dir):
        print(f"Warning: Template directory {template_dir} not found. Please add cursor PNGs.")
        return templates
        
    for fname in os.listdir(template_dir):
        if fname.endswith(".png"):
            # Load with alpha channel for masking if available
            path = os.path.join(template_dir, fname)
            img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
            if img is not None:
                templates.append((fname, img))
    return templates

def detect_cursor_in_frame(frame, templates, threshold=0.8, scales=[0.5, 0.75, 1.0, 1.25, 1.5]):
    gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    best_val = -1
    best_loc = None
    best_w, best_h = 0, 0
    
    for name, template in templates:
        # Handle alpha mask
        mask = None
        if template.shape[-1] == 4:
            mask = template[:, :, 3]
            template_bgr = template[:, :, :3]
            template_gray = cv2.cvtColor(template_bgr, cv2.COLOR_BGR2GRAY)
        else:
            template_gray = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)
            
        for scale in scales:
            # Resize template according to scale
            width = int(template_gray.shape[1] * scale)
            height = int(template_gray.shape[0] * scale)
            if width > gray_frame.shape[1] or height > gray_frame.shape[0]:
                continue
                
            resized_template = cv2.resize(template_gray, (width, height))
            resized_mask = cv2.resize(mask, (width, height)) if mask is not None else None
            
            # Use TM_CCORR_NORMED for masked matching, or TM_CCOEFF_NORMED otherwise
            if resized_mask is not None:
                # CCOEFF_NORMED doesn't support mask in all OpenCV versions, fallback to CCORR_NORMED
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

def process_video(video_path, template_dir, output_path, threshold=0.8):
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
    
    print(f"Detecting cursor in {video_path}...")
    for frame_idx in tqdm(range(total_frames)):
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
    parser.add_argument("--threshold", type=float, default=0.8, help="Confidence threshold")
    
    args = parser.parse_args()
    
    # Create template dir if it doesn't exist
    if not os.path.exists(args.templates):
        os.makedirs(args.templates)
        
    process_video(args.video, args.templates, args.output, args.threshold)

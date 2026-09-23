import cv2
import json
import argparse
import os
from tqdm import tqdm

def visualize(video_path, json_path, output_path):
    if not os.path.exists(video_path):
        print(f"Error: Video file {video_path} not found.")
        return
    if not os.path.exists(json_path):
        print(f"Error: JSON file {json_path} not found.")
        return

    with open(json_path, 'r') as f:
        data = json.load(f)
    frames_data = data.get("frames", {})

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    print(f"Generating visualization at {output_path}...")
    
    # We will draw the last known cursor position if a frame is skipped
    last_known_bbox = None

    for idx in tqdm(range(total_frames)):
        ret, frame = cap.read()
        if not ret:
            break

        str_idx = str(idx)
        if str_idx in frames_data:
            d = frames_data[str_idx]
            last_known_bbox = (d['x'], d['y'], d['w'], d['h'])
            
            # Draw green box for active detection
            cv2.rectangle(frame, (d['x'], d['y']), (d['x'] + d['w'], d['y'] + d['h']), (0, 255, 0), 2)
            cv2.putText(frame, f"Conf: {d['confidence']:.2f}", (d['x'], d['y'] - 10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        elif last_known_bbox is not None:
            x, y, w, h = last_known_bbox
            # Draw red box for interpolated/held position
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 0, 255), 2)

        out.write(frame)

    cap.release()
    out.release()
    print("OpenCV rendering complete.")

    # Convert to H.264 using ffmpeg for Mac QuickTime compatibility
    h264_output = output_path.replace(".mp4", "_h264.mp4")
    if h264_output == output_path:
        h264_output = output_path + "_h264.mp4"
    
    print("Converting to H.264 for macOS compatibility...")
    ret = os.system(f"ffmpeg -y -i {output_path} -c:v libx264 -preset fast -crf 22 -c:a copy {h264_output} > /dev/null 2>&1")
    if ret == 0:
        print(f"✅ H.264 video created: {h264_output}")
    else:
        print(f"Visualization saved to {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--json", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    
    visualize(args.video, args.json, args.output)


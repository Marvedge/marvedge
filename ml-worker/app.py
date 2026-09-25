import gradio as gr
import subprocess
import os
import json
import tempfile
import cv2

def run_validation(out_dir):
    """Run test_preprocess_faces.py and return a structured summary dict."""
    result = subprocess.run(
        ["python", "/app/test_preprocess_faces.py", "--outputDir", out_dir],
        capture_output=True, text=True
    )
    lines = (result.stdout + result.stderr).splitlines()
    passed = sum(1 for l in lines if "[PASS]" in l)
    failed = sum(1 for l in lines if "[FAIL]" in l)
    warned = sum(1 for l in lines if "[WARN]" in l)
    return {
        "passed": passed,
        "failed": failed,
        "warnings": warned,
        "status": "✅ ALL PASS" if failed == 0 else f"❌ {failed} FAILED",
        "detail": lines[-3:] if lines else []
    }

def process_video(video_path):
    if not video_path:
        return {"error": "No video provided."}, None
    
    # Run the pipeline
    with tempfile.TemporaryDirectory() as out_dir:
        cmd = [
            "python", "/app/TalkNet-ASD/preprocess_faces.py",
            "--videoPath", video_path,
            "--savePath", out_dir,
            "--nDataLoaderThread", "2",
            "--minTrack", "5"
        ]
        
        try:
            # Run inside TalkNet-ASD directory so local imports (model.faceDetector) work
            subprocess.run(cmd, check=True, cwd="/app/TalkNet-ASD")
        except subprocess.CalledProcessError as e:
            return {"error": f"Pipeline failed: {str(e)}"}, None
        
        meta_path = os.path.join(out_dir, "metadata.json")
        if not os.path.exists(meta_path):
            return {"error": "Failed to generate metadata."}, None
            
        with open(meta_path, 'r') as f:
            metadata = json.load(f)

        # Auto-run validation suite and embed results
        validation = run_validation(out_dir)
        metadata["_validation"] = validation
            
        # Draw bounding boxes onto the video
        pyavi_video = os.path.join(out_dir, "pyavi", "video.avi")
        pyavi_audio = os.path.join(out_dir, "pyavi", "audio.wav")
        annotated_avi = os.path.join(out_dir, "annotated.avi")
        
        frame_bboxes = {}
        for track in metadata['tracks']:
            for item in track['bbox_history']:
                f_idx = item['frame']
                bbox = item['bbox']
                if f_idx not in frame_bboxes:
                    frame_bboxes[f_idx] = []
                frame_bboxes[f_idx].append(bbox)
                
        cap = cv2.VideoCapture(pyavi_video)
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0 or fps != fps:
            fps = 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        fourcc = cv2.VideoWriter_fourcc(*'XVID')
        out = cv2.VideoWriter(annotated_avi, fourcc, fps, (width, height))
        
        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            if frame_idx in frame_bboxes:
                for bbox in frame_bboxes[frame_idx]:
                    x1, y1, x2, y2 = map(int, bbox)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 3)
                    
            out.write(frame)
            frame_idx += 1
            
        cap.release()
        out.release()
        
        # Convert annotated video to mp4 with original audio
        gradio_out = tempfile.mkdtemp(prefix="gradio_out_")
        final_mp4 = os.path.join(gradio_out, "annotated_tracked.mp4")
        
        subprocess.run([
            "ffmpeg", "-y", 
            "-i", annotated_avi,
            "-i", pyavi_audio,
            "-vcodec", "libx264", 
            "-acodec", "aac",
            "-strict", "experimental",
            final_mp4
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        return metadata, final_mp4

with gr.Blocks(title="Marvedge Face Tracking Demo", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# 🤖 Marvedge Face Tracking Pipeline")
    gr.Markdown(
        "Upload a video to test the **S3FD + IoU** face tracking pipeline in a containerized environment. "
        "The pipeline automatically validates its own output and reports results in the metadata panel."
    )
    
    with gr.Row():
        with gr.Column(scale=1):
            video_in = gr.Video(label="Input Video")
            btn = gr.Button("Process Video", variant="primary")
        with gr.Column(scale=1):
            meta_out = gr.JSON(label="Pipeline Metadata + Validation Results")
            
    gr.Markdown("### Tracked Output")
    gr.Markdown(
        "The pipeline overlays green bounding boxes onto each detected speaker and returns "
        "a single annotated video. The `_validation` key in the metadata panel shows the "
        "automated test suite results."
    )
    video_out = gr.Video(label="Annotated Tracking Output")
    
    btn.click(fn=process_video, inputs=video_in, outputs=[meta_out, video_out])

if __name__ == "__main__":
    # Expose on 0.0.0.0:8080 for Docker / Cloud Run compatibility
    demo.queue().launch(server_name="0.0.0.0", server_port=8080)

import gradio as gr
import subprocess
import os
import json
import tempfile
import cv2

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
    gr.Markdown("Upload a video to test the S3FD + IoU face tracking pipeline in a containerized environment.")
    
    with gr.Row():
        with gr.Column(scale=1):
            video_in = gr.Video(label="Input Video")
            btn = gr.Button("Process Video", variant="primary")
        with gr.Column(scale=1):
            meta_out = gr.JSON(label="Pipeline Metadata")
            
    gr.Markdown("### Tracked Output")
    gr.Markdown("The pipeline generates an annotated video showing the detected speaker bounding boxes.")
    video_out = gr.Video(label="Annotated Tracking Output")
    
    btn.click(fn=process_video, inputs=video_in, outputs=[meta_out, video_out])

if __name__ == "__main__":
    # Expose on 0.0.0.0:8080 for Docker / Cloud Run compatibility
    demo.queue().launch(server_name="0.0.0.0", server_port=8080)

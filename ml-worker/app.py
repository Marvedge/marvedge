import gradio as gr
import subprocess
import os
import json
import tempfile
import glob
from shutil import copyfile

def process_video(video_path):
    if not video_path:
        return {"error": "No video provided."}, []
    
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
            return {"error": f"Pipeline failed: {str(e)}"}, []
        
        meta_path = os.path.join(out_dir, "metadata.json")
        if not os.path.exists(meta_path):
            return {"error": "Failed to generate metadata."}, []
            
        with open(meta_path, 'r') as f:
            metadata = json.load(f)
            
        # Convert all .avi in pycrop to .mp4 for native browser playback
        out_videos = []
        crop_dir = os.path.join(out_dir, "pycrop")
        if os.path.exists(crop_dir):
            for avi_file in sorted(glob.glob(os.path.join(crop_dir, "*.avi"))):
                mp4_file = avi_file.replace(".avi", ".mp4")
                # Convert using ffmpeg
                subprocess.run([
                    "ffmpeg", "-y", "-i", avi_file,
                    "-vcodec", "libx264", "-acodec", "aac",
                    mp4_file
                ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                out_videos.append(mp4_file)
        
        # Copy to a persistent temp dir so Gradio can serve them after the context manager closes
        gradio_out = tempfile.mkdtemp(prefix="gradio_out_")
        served_videos = []
        for v in out_videos:
            dest = os.path.join(gradio_out, os.path.basename(v))
            copyfile(v, dest)
            served_videos.append(dest)
            
        return metadata, served_videos

with gr.Blocks(title="Marvedge Face Tracking Demo", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# 🤖 Marvedge Face Tracking Pipeline")
    gr.Markdown("Upload a video to test the S3FD + IoU face tracking pipeline in a containerized environment.")
    
    with gr.Row():
        with gr.Column(scale=1):
            video_in = gr.Video(label="Input Video")
            btn = gr.Button("Process Video", variant="primary")
        with gr.Column(scale=1):
            meta_out = gr.JSON(label="Pipeline Metadata")
            
    gr.Markdown("### Extracted Face Tracks")
    gr.Markdown("The pipeline outputs individual cropped video tracks for each detected speaker. Download or preview them below.")
    files_out = gr.File(label="Processed Face Crops (.mp4)", file_count="multiple")
    
    btn.click(fn=process_video, inputs=video_in, outputs=[meta_out, files_out])

if __name__ == "__main__":
    # Expose on 0.0.0.0:8080 for Docker / Cloud Run compatibility
    demo.queue().launch(server_name="0.0.0.0", server_port=8080)

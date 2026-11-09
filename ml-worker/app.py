import gradio as gr
import subprocess
import os
import json
import tempfile
import cv2
import logging

logger = logging.getLogger("ml-worker")

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

def _flag_enabled(value) -> bool:
    """Returns True only for an explicit, unambiguous opt-in flag value."""
    return isinstance(value, str) and value.strip().lower() in {"1", "true"}


def resolve_gradio_launch_config(env=None):
    """
    Resolve Gradio credentials and bind settings, failing closed by default.

    Returns (auth, server_name, server_port), where auth is either a
    (username, password) tuple or None.

    Security contract:
    - Both GRADIO_USERNAME and GRADIO_PASSWORD are required to launch.
    - Without them, launch is refused unless GRADIO_ALLOW_INSECURE=1/true is
      explicitly set for local development.
    - Insecure mode always forces the bind address to 127.0.0.1 so an
      unauthenticated UI can never be reached from another host.
    - Authenticated mode defaults to 127.0.0.1 for direct runs; Docker sets
      GRADIO_SERVER_NAME=0.0.0.0 so the loopback-only host port mapping works.
    """
    env = os.environ if env is None else env

    username = (env.get("GRADIO_USERNAME") or "").strip()
    password = (env.get("GRADIO_PASSWORD") or "").strip()
    allow_insecure = _flag_enabled(env.get("GRADIO_ALLOW_INSECURE", ""))

    server_name = (env.get("GRADIO_SERVER_NAME") or "127.0.0.1").strip()
    if not server_name:
        server_name = "127.0.0.1"

    raw_port = (env.get("GRADIO_SERVER_PORT") or "8080").strip()
    try:
        server_port = int(raw_port)
    except (TypeError, ValueError) as exc:
        raise SystemExit(
            f"ERROR: GRADIO_SERVER_PORT must be an integer, got {raw_port!r}"
        ) from exc
    if not 1 <= server_port <= 65535:
        raise SystemExit(
            f"ERROR: GRADIO_SERVER_PORT must be between 1 and 65535, got {server_port}"
        )

    if username and password:
        return (username, password), server_name, server_port

    if allow_insecure:
        logger.warning(
            "SECURITY WARNING: GRADIO_USERNAME/GRADIO_PASSWORD are not both set "
            "and GRADIO_ALLOW_INSECURE=%s. Launching an UNAUTHENTICATED Gradio UI "
            "bound to 127.0.0.1 only. Local development use only.",
            env.get("GRADIO_ALLOW_INSECURE", ""),
        )
        return None, "127.0.0.1", server_port

    raise SystemExit(
        "ERROR: GRADIO_USERNAME and GRADIO_PASSWORD must both be set; refusing "
        "to start an unauthenticated Gradio UI. For local development only, set "
        "GRADIO_ALLOW_INSECURE=1 (the server is then forced to bind to 127.0.0.1)."
    )


def launch_demo(demo, env=None):
    """Launch the Gradio demo after enforcing the authentication policy."""
    auth, server_name, server_port = resolve_gradio_launch_config(env)
    demo.queue().launch(
        server_name=server_name,
        server_port=server_port,
        auth=auth,
    )


if __name__ == "__main__":
    # The Gradio port is loopback-published by ml-worker/docker-compose.yml.
    # Credentials never live in code — they come from GRADIO_USERNAME /
    # GRADIO_PASSWORD. Missing credentials fail closed unless the explicit
    # GRADIO_ALLOW_INSECURE=1 local-dev flag is set.
    launch_demo(demo)

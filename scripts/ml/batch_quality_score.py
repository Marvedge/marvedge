import os
import glob
import json
import subprocess
import argparse
import time

def run_pipeline(video_path, save_dir, legacy_mode=False):
    """Run benchmark_preprocessing on a single video."""
    vid_name = os.path.basename(video_path)
    vid_out_dir = os.path.join(save_dir, vid_name + "_out")
    report_path = os.path.join(vid_out_dir, "benchmark_report.json")
    
    # We assume benchmark_preprocessing.py is in the same directory
    script_path = os.path.join(os.path.dirname(__file__), "benchmark_preprocessing.py")
    
    import sys
    cmd = [
        sys.executable, script_path,
        "--videoPath", video_path,
        "--savePath", vid_out_dir,
        "--reportPath", report_path
    ]
    
    print(f"[{'LEGACY' if legacy_mode else 'OPTIMIZED'}] Processing {vid_name}...")
    
    start_time = time.time()
    try:
        # Run process
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        success = True
        error_msg = ""
    except subprocess.CalledProcessError as e:
        success = False
        error_msg = e.stderr.strip().split('\n')[-1] if e.stderr else "Unknown Error"
        
    end_time = time.time()
    
    # Parse report
    tracks_found = 0
    fps = 0.0
    if success and os.path.exists(report_path):
        try:
            with open(report_path, 'r') as f:
                rep = json.load(f)
                tracks_found = rep.get("tracks_found", 0)
                fps = rep.get("fps_throughput", 0.0)
        except Exception:
            pass
            
    return {
        "video": vid_name,
        "success": success,
        "time_sec": round(end_time - start_time, 2),
        "tracks": tracks_found,
        "fps": fps,
        "error": error_msg
    }

def main():
    parser = argparse.ArgumentParser(description="Batch Quality Scorer for TalkNet Preprocessing")
    parser.add_argument("--datasetDir", required=True, help="Directory containing sample MP4 videos")
    parser.add_argument("--outDir", required=True, help="Output directory for scores")
    parser.add_argument("--mode", choices=["before", "after"], required=True, help="Mode for recording results")
    args = parser.parse_args()

    os.makedirs(args.outDir, exist_ok=True)
    videos = glob.glob(os.path.join(args.datasetDir, "*.mp4"))
    
    if not videos:
        print(f"Error: No .mp4 videos found in {args.datasetDir}")
        return
        
    print(f"Found {len(videos)} videos in {args.datasetDir}")
    
    results = []
    success_count = 0
    
    for vid in videos:
        res = run_pipeline(vid, args.outDir, legacy_mode=(args.mode == "before"))
        results.append(res)
        if res["success"]:
            success_count += 1
            
    # Calculate aggregates
    total = len(videos)
    avg_fps = sum(r["fps"] for r in results if r["success"]) / max(1, success_count)
    total_tracks = sum(r["tracks"] for r in results)
    
    summary = {
        "mode": args.mode,
        "total_videos": total,
        "successful_videos": success_count,
        "success_rate": f"{(success_count/total)*100:.1f}%",
        "average_fps": round(avg_fps, 2),
        "total_tracks_found": total_tracks,
        "details": results
    }
    
    out_json = os.path.join(args.outDir, f"score_{args.mode}.json")
    with open(out_json, "w") as f:
        json.dump(summary, f, indent=4)
        
    print("\n" + "="*50)
    print(f"BATCH SCORING COMPLETE ({args.mode.upper()})")
    print(f"Success Rate: {success_count}/{total} ({(success_count/total)*100:.1f}%)")
    print(f"Avg FPS: {avg_fps:.2f}")
    print(f"Total Tracks: {total_tracks}")
    print(f"Results saved to {out_json}")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()

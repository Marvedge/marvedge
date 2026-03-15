import { ZoomEffect } from "../types/editor/zoom-effect";

/**
 * Easing function: cubic ease-in-out for smooth zoom transitions.
 * Maps t ∈ [0,1] → [0,1] with smooth acceleration and deceleration.
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const createEnhancedZoomProcessor = async (
  videoBlob: Blob,
  zoomEffects: ZoomEffect[]
): Promise<Blob> => {
  console.log("=== ENHANCED ZOOM PROCESSING (v2 — requestVideoFrameCallback) ===");
  console.log("Input video size:", videoBlob.size);
  console.log("Zoom effects:", zoomEffects);

  if (zoomEffects.length === 0) {
    console.log("No zoom effects, returning original video");
    return videoBlob;
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Failed to get 2D context"));
      return;
    }

    // Match the source video resolution (set in onloadedmetadata)
    canvas.width = 1920;
    canvas.height = 1080;

    // High-quality rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const chunks: Blob[] = [];

    // Capture at 60fps for smooth output
    const stream = canvas.captureStream(60);
    if (!stream) {
      reject(new Error("Failed to capture stream from canvas"));
      return;
    }

    // Try best available codec with high bitrate
    let mimeType = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm;codecs=vp8";
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm";
    }

    console.log("Using MIME type:", mimeType);

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000, // 8 Mbps for high quality
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const finalBlob = new Blob(chunks, { type: "video/webm" });
      console.log("Zoom processing completed. Output size:", finalBlob.size);
      URL.revokeObjectURL(video.src);
      resolve(finalBlob);
    };

    /**
     * Render one frame to the canvas. Called per-frame by
     * requestVideoFrameCallback (preferred) or requestAnimationFrame (fallback).
     */
    const renderFrame = () => {
      const currentTime = video.currentTime;

      // Find active zoom effect for this timestamp
      const activeEffect = zoomEffects.find(
        (effect) => currentTime >= effect.startTime && currentTime <= effect.endTime
      );

      // Calculate smooth transition progress with easing
      let transitionProgress = 0;
      if (activeEffect) {
        const effectDuration = activeEffect.endTime - activeEffect.startTime;
        const timeInEffect = currentTime - activeEffect.startTime;
        // Transition in/out over 0.3s or 1/6 of effect duration, whichever is smaller
        const transitionDuration = Math.min(0.3, effectDuration / 6);

        if (timeInEffect < transitionDuration) {
          // Zooming in
          transitionProgress = easeInOutCubic(timeInEffect / transitionDuration);
        } else if (timeInEffect > effectDuration - transitionDuration) {
          // Zooming out
          transitionProgress = easeInOutCubic((effectDuration - timeInEffect) / transitionDuration);
        } else {
          // Fully zoomed
          transitionProgress = 1;
        }
      }

      // Clear canvas
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (activeEffect && transitionProgress > 0) {
        // Use the exact zoomLevel from the effect (Shallow=2, Medium=3, Deep=4)
        const targetZoom = activeEffect.zoomLevel;
        const smoothZoomLevel = 1 + (targetZoom - 1) * transitionProgress;

        // Center point from the effect (normalized 0-1)
        const centerX = activeEffect.x;
        const centerY = activeEffect.y;

        // Calculate the visible region of the source video when zoomed
        const srcW = canvas.width / smoothZoomLevel;
        const srcH = canvas.height / smoothZoomLevel;

        // Position the crop region centered on (centerX, centerY), clamped to bounds
        const srcX = Math.max(0, Math.min(canvas.width - srcW, centerX * canvas.width - srcW / 2));
        const srcY = Math.max(
          0,
          Math.min(canvas.height - srcH, centerY * canvas.height - srcH / 2)
        );

        // Draw the zoomed portion of the video to fill the entire canvas
        ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
      } else {
        // No zoom — draw full video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    };

    /**
     * Schedule the next frame render using the best available API.
     * requestVideoFrameCallback fires once per decoded video frame (ideal).
     * Falls back to requestAnimationFrame if RVFC is unavailable.
     */
    const scheduleNextFrame = () => {
      if (video.ended || video.paused) {
        return;
      }

      if ("requestVideoFrameCallback" in video) {
        (
          video as HTMLVideoElement & {
            requestVideoFrameCallback: (cb: () => void) => void;
          }
        ).requestVideoFrameCallback(() => {
          renderFrame();
          scheduleNextFrame();
        });
      } else {
        // Fallback: requestAnimationFrame (fires at display refresh rate, ~60Hz)
        requestAnimationFrame(() => {
          renderFrame();
          scheduleNextFrame();
        });
      }
    };

    video.onloadedmetadata = () => {
      // Match canvas to source video dimensions for best quality
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        console.log(`Canvas matched to video: ${canvas.width}x${canvas.height}`);
      }

      console.log("Video loaded, starting frame-accurate zoom processing...");
      video.currentTime = 0;
    };

    video.onseeked = () => {
      // Start recording and playback once seeked to 0
      if (video.currentTime === 0) {
        mediaRecorder.start(100); // Collect data every 100ms
        video.play();
        scheduleNextFrame();
      }
    };

    video.onended = () => {
      console.log("Video ended, finalizing...");
      // Render the very last frame
      renderFrame();
      // Small delay to ensure last frame is captured by MediaRecorder
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 200);
    };

    video.onerror = (error) => {
      console.error("Video error:", error);
      reject(error);
    };

    // Prevent the video from being muted (we want audio in output)
    video.muted = true; // Must be muted for autoplay policy; audio comes from original
    video.playsInline = true;
    video.src = URL.createObjectURL(videoBlob);
  });
};

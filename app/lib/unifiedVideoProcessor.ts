/**
 * unifiedVideoProcessor.ts
 *
 * Single-pass canvas processor that applies zoom effects AND background
 * compositing simultaneously. This avoids the double re-encoding quality loss
 * from running zoom and background as separate passes.
 *
 * Pipeline per frame:
 *  1. Draw background (if any)
 *  2. Draw video frame as floating card (with rounded corners) — with zoom applied
 *  3. MediaRecorder captures the canvas
 */

import { ZoomEffect } from "../types/editor/zoom-effect";

// Easing: cubic ease-in-out for smooth zoom transitions
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Gradient definitions matching useBackgroundStyle.ts
// Tuple: [angleDeg, colorStop0, colorStop1, colorStop2]
const GRADIENTS: Record<string, [string, string, string, string]> = {
  sunset: ["135deg", "#f093fb", "#f5576c", "#4facfe"],
  ocean: ["135deg", "#667eea", "#764ba2", "#764ba2"],
  mint: ["135deg", "#a8edea", "#fed6e3", "#fed6e3"],
  royal: ["135deg", "#667eea", "#764ba2", "#764ba2"],
  steel: ["135deg", "#bdc3c7", "#2c3e50", "#2c3e50"],
  candy: ["135deg", "#fa709a", "#fee140", "#fee140"],
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  selectedBackground: string,
  bgImage: HTMLImageElement | null
) {
  ctx.save();

  if (selectedBackground.startsWith("color:")) {
    ctx.fillStyle = selectedBackground.replace("color:", "");
    ctx.fillRect(0, 0, W, H);
  } else if (selectedBackground.startsWith("gradient:")) {
    const id = selectedBackground.replace("gradient:", "");
    const def = GRADIENTS[id];
    if (def) {
      const rad = ((parseFloat(def[0]) - 90) * Math.PI) / 180;
      const halfD = Math.sqrt(W * W + H * H) / 2;
      const grad = ctx.createLinearGradient(
        W / 2 - Math.cos(rad) * halfD,
        H / 2 - Math.sin(rad) * halfD,
        W / 2 + Math.cos(rad) * halfD,
        H / 2 + Math.sin(rad) * halfD
      );
      grad.addColorStop(0, def[1]);
      grad.addColorStop(0.5, def[2]);
      grad.addColorStop(1, def[3]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, W, H);
    }
  } else if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, W, H);
  } else {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

/**
 * Draw the video frame — either full-frame (no background) or as a floating
 * card (with background). Zoom is applied by cropping the source video region.
 */
function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  W: number,
  H: number,
  hasBackground: boolean,
  zoomEffect: ZoomEffect | null,
  zoomProgress: number
) {
  // Destination rect — floating card or full frame
  let dstX = 0,
    dstY = 0,
    dstW = W,
    dstH = H;
  let radius = 0;

  if (hasBackground) {
    dstW = W * 0.88;
    dstH = H * 0.8;
    dstX = (W - dstW) / 2;
    dstY = (H - dstH) / 2;
    radius = Math.min(W, H) * 0.022;
  }

  // Source crop rect (zoom)
  let srcX = 0,
    srcY = 0,
    srcW = W,
    srcH = H;
  if (zoomEffect && zoomProgress > 0) {
    const smoothZoom = 1 + (zoomEffect.zoomLevel - 1) * zoomProgress;
    srcW = W / smoothZoom;
    srcH = H / smoothZoom;
    const cx = zoomEffect.x * W;
    const cy = zoomEffect.y * H;
    srcX = Math.max(0, Math.min(W - srcW, cx - srcW / 2));
    srcY = Math.max(0, Math.min(H - srcH, cy - srcH / 2));
  }

  ctx.save();

  if (hasBackground) {
    // Drop shadow behind the card
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = Math.min(W, H) * 0.04;
    ctx.shadowOffsetY = Math.min(W, H) * 0.01;

    // Rounded clip
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(dstX, dstY, dstW, dstH, radius);
    } else {
      const r = radius;
      ctx.moveTo(dstX + r, dstY);
      ctx.lineTo(dstX + dstW - r, dstY);
      ctx.quadraticCurveTo(dstX + dstW, dstY, dstX + dstW, dstY + r);
      ctx.lineTo(dstX + dstW, dstY + dstH - r);
      ctx.quadraticCurveTo(dstX + dstW, dstY + dstH, dstX + dstW - r, dstY + dstH);
      ctx.lineTo(dstX + r, dstY + dstH);
      ctx.quadraticCurveTo(dstX, dstY + dstH, dstX, dstY + dstH - r);
      ctx.lineTo(dstX, dstY + r);
      ctx.quadraticCurveTo(dstX, dstY, dstX + r, dstY);
      ctx.closePath();
    }
    ctx.clip();
    ctx.shadowColor = "transparent"; // shadow only on card edge, not inside
  }

  // Draw video (zoomed or full)
  ctx.drawImage(video, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);

  ctx.restore();
}

export async function processVideoUnified(
  videoBlob: Blob,
  zoomEffects: ZoomEffect[],
  selectedBackground: string | null,
  imageMap: Record<string, string>,
  customBackgroundUrl?: string | null
): Promise<Blob> {
  const hasZoom = zoomEffects.length > 0;
  const hasBg = !!selectedBackground && selectedBackground !== "hidden";

  // If nothing to do, return original
  if (!hasZoom && !hasBg) {
    return videoBlob;
  }

  console.log("=== UNIFIED VIDEO PROCESSOR ===");
  console.log("Zoom effects:", zoomEffects.length, "| Background:", selectedBackground);

  // Pre-load background image if needed
  let bgImage: HTMLImageElement | null = null;
  if (hasBg) {
    if (selectedBackground === "custom" && customBackgroundUrl) {
      try {
        bgImage = await loadImage(customBackgroundUrl);
      } catch {
        /* no-op */
      }
    } else if (selectedBackground && imageMap[selectedBackground]) {
      try {
        bgImage = await loadImage(imageMap[selectedBackground]);
      } catch {
        /* no-op */
      }
    }
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Failed to get 2D context"));
      return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const chunks: Blob[] = [];
    const stream = canvas.captureStream(60);
    if (!stream) {
      reject(new Error("Failed to capture stream"));
      return;
    }

    let mimeType = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm;codecs=vp8";
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm";
    }

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };
    mediaRecorder.onstop = () => {
      URL.revokeObjectURL(video.src);
      resolve(new Blob(chunks, { type: "video/webm" }));
    };

    const renderFrame = () => {
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      // 1. Background
      if (hasBg && selectedBackground) {
        drawBackground(ctx, W, H, selectedBackground, bgImage);
      } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
      }

      // 2. Find active zoom for current timestamp
      const t = video.currentTime;
      let activeZoom: ZoomEffect | null = null;
      let zoomProgress = 0;

      if (hasZoom) {
        activeZoom = zoomEffects.find((e) => t >= e.startTime && t <= e.endTime) ?? null;

        if (activeZoom) {
          const dur = activeZoom.endTime - activeZoom.startTime;
          const elapsed = t - activeZoom.startTime;
          const transition = Math.min(0.3, dur / 6);
          if (elapsed < transition) {
            zoomProgress = easeInOutCubic(elapsed / transition);
          } else if (elapsed > dur - transition) {
            zoomProgress = easeInOutCubic((dur - elapsed) / transition);
          } else {
            zoomProgress = 1;
          }
        }
      }

      // 3. Video frame (with zoom + floating card if background)
      drawVideoFrame(ctx, video, W, H, hasBg, activeZoom, zoomProgress);
    };

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
        requestAnimationFrame(() => {
          renderFrame();
          scheduleNextFrame();
        });
      }
    };

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      video.currentTime = 0;
    };

    video.onseeked = () => {
      if (video.currentTime === 0) {
        mediaRecorder.start(100);
        video.play();
        scheduleNextFrame();
      }
    };

    video.onended = () => {
      renderFrame();
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 200);
    };

    video.onerror = reject;
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(videoBlob);
  });
}

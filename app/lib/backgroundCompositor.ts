/**
 * backgroundCompositor.ts
 *
 * Composites a background behind the video for export.
 * The video is rendered as a "floating card" (centred, 88% width × 80% height,
 * with rounded corners) — matching the editor preview layout.
 *
 * Uses requestVideoFrameCallback for frame-perfect output (same as enhancedZoomProcessor).
 */

// Gradient definitions — must match useBackgroundStyle.ts
// Tuple: [angle, colorStop0, colorStop1, colorStop2]
const GRADIENTS: Record<string, [string, string, string, string]> = {
  sunset: ["135deg", "#f093fb", "#f5576c", "#4facfe"],
  ocean: ["135deg", "#667eea", "#764ba2", "#764ba2"],
  mint: ["135deg", "#a8edea", "#fed6e3", "#fed6e3"],
  royal: ["135deg", "#667eea", "#764ba2", "#764ba2"],
  steel: ["135deg", "#bdc3c7", "#2c3e50", "#2c3e50"],
  candy: ["135deg", "#fa709a", "#fee140", "#fee140"],
};

/** Load an image from a URL and return a resolved HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Draw the background on ctx.
 */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  bg: string,
  bgImage: HTMLImageElement | null
) {
  ctx.save();

  if (bg.startsWith("color:")) {
    const color = bg.replace("color:", "");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.startsWith("gradient:")) {
    const id = bg.replace("gradient:", "");
    const def = GRADIENTS[id];
    if (def) {
      const angleDeg = parseFloat(def[0]);
      const rad = ((angleDeg - 90) * Math.PI) / 180;
      const halfD = Math.sqrt(W * W + H * H) / 2;
      const cx = W / 2;
      const cy = H / 2;
      const x0 = cx - Math.cos(rad) * halfD;
      const y0 = cy - Math.sin(rad) * halfD;
      const x1 = cx + Math.cos(rad) * halfD;
      const y1 = cy + Math.sin(rad) * halfD;

      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
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
 * Draw the video frame as a centred "floating card" with rounded corners
 * and a subtle drop shadow — matching the editor's 90%/81% layout.
 */
function drawVideoCard(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  W: number,
  H: number
) {
  const CARD_W = W * 0.88;
  const CARD_H = H * 0.8;
  const CARD_X = (W - CARD_W) / 2;
  const CARD_Y = (H - CARD_H) / 2;
  const RADIUS = Math.min(W, H) * 0.022; // ~24px on 1080p

  ctx.save();

  // Subtle drop shadow
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = Math.min(W, H) * 0.04;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.min(W, H) * 0.01;

  // Rounded clip region
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(CARD_X, CARD_Y, CARD_W, CARD_H, RADIUS);
  } else {
    // Polyfill for browsers without roundRect
    const r = RADIUS;
    ctx.moveTo(CARD_X + r, CARD_Y);
    ctx.lineTo(CARD_X + CARD_W - r, CARD_Y);
    ctx.quadraticCurveTo(CARD_X + CARD_W, CARD_Y, CARD_X + CARD_W, CARD_Y + r);
    ctx.lineTo(CARD_X + CARD_W, CARD_Y + CARD_H - r);
    ctx.quadraticCurveTo(CARD_X + CARD_W, CARD_Y + CARD_H, CARD_X + CARD_W - r, CARD_Y + CARD_H);
    ctx.lineTo(CARD_X + r, CARD_Y + CARD_H);
    ctx.quadraticCurveTo(CARD_X, CARD_Y + CARD_H, CARD_X, CARD_Y + CARD_H - r);
    ctx.lineTo(CARD_X, CARD_Y + r);
    ctx.quadraticCurveTo(CARD_X, CARD_Y, CARD_X + r, CARD_Y);
    ctx.closePath();
  }
  ctx.clip();

  // Clear shadow inside clip so it only affects the card outline
  ctx.shadowColor = "transparent";
  ctx.drawImage(video, CARD_X, CARD_Y, CARD_W, CARD_H);

  ctx.restore();
}

export async function applyBackgroundToVideo(
  videoBlob: Blob,
  selectedBackground: string,
  imageMap: Record<string, string>,
  customBackgroundUrl?: string | null
): Promise<Blob> {
  console.log("=== BACKGROUND COMPOSITOR ===");
  console.log("Background:", selectedBackground);

  if (!selectedBackground || selectedBackground === "hidden") {
    return videoBlob;
  }

  // Pre-load background image if needed
  let bgImage: HTMLImageElement | null = null;
  if (selectedBackground === "custom" && customBackgroundUrl) {
    try {
      bgImage = await loadImage(customBackgroundUrl);
    } catch {
      console.warn("Could not load custom background image");
    }
  } else if (imageMap[selectedBackground]) {
    try {
      bgImage = await loadImage(imageMap[selectedBackground]);
    } catch {
      console.warn("Could not load preset background image:", imageMap[selectedBackground]);
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
      reject(new Error("Failed to capture canvas stream"));
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
      const finalBlob = new Blob(chunks, { type: "video/webm" });
      console.log("Background compositor done. Output size:", finalBlob.size);
      URL.revokeObjectURL(video.src);
      resolve(finalBlob);
    };

    const renderFrame = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // 1. Draw background
      drawBackground(ctx, W, H, selectedBackground, bgImage);

      // 2. Draw video as floating card
      drawVideoCard(ctx, video, W, H);
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
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        console.log(`Canvas: ${canvas.width}×${canvas.height}`);
      } else {
        canvas.width = 1920;
        canvas.height = 1080;
      }
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
      renderFrame(); // catch last frame
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

export async function fixWebmDurationIfNeeded(blob: Blob): Promise<Blob> {
  const type = (blob.type || "").toLowerCase();
  if (!type.includes("webm")) {
    return blob;
  }

  try {
    const [{ default: ysFixWebmDuration }, durationMs] = await Promise.all([
      import("fix-webm-duration"),
      estimateDurationMs(blob),
    ]);

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return blob;
    }

    const fixed = await ysFixWebmDuration(blob, durationMs, {
      logger: false,
    });
    return fixed || blob;
  } catch (error) {
    console.warn("WebM duration fix skipped:", error);
    return blob;
  }
}

function estimateDurationMs(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "metadata";

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const seconds = Number(video.duration);
      cleanup();
      resolve(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0);
    };

    video.onerror = () => {
      cleanup();
      resolve(0);
    };

    video.src = url;
  });
}

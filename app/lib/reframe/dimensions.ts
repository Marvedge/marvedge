/**
 * Helper to obtain the intrinsic pixel dimensions (videoWidth, videoHeight)
 * of a source video in the browser for reframe jobs.
 */

export interface SourceDimensions {
  width: number;
  height: number;
}

/**
 * Resolves the intrinsic dimensions of a video.
 *
 * 1. Checks active <video> elements in the DOM (e.g. preview player in editor).
 * 2. Probes metadata using an offscreen HTMLVideoElement if DOM element is not yet ready.
 *
 * Only returns valid, positive, finite pixel dimensions.
 */
export async function getVideoDimensions(
  url?: string | null
): Promise<SourceDimensions | undefined> {
  if (typeof window === "undefined") return undefined;

  // 1. Try any active video element already present in the DOM
  try {
    const existingVideos = Array.from(document.querySelectorAll("video"));
    for (const v of existingVideos) {
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (
        typeof w === "number" &&
        typeof h === "number" &&
        Number.isFinite(w) &&
        Number.isFinite(h) &&
        w > 0 &&
        h > 0
      ) {
        if (!url || v.src === url || v.currentSrc === url || existingVideos.length === 1) {
          return {
            width: Math.round(w),
            height: Math.round(h),
          };
        }
      }
    }
  } catch {
    // Non-DOM environment fallback
  }

  if (!url) return undefined;

  // 2. Offscreen probe element
  return new Promise<SourceDimensions | undefined>((resolve) => {
    try {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.muted = true;

      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        probe.removeEventListener("loadedmetadata", onLoaded);
        probe.removeEventListener("error", onError);
        probe.removeAttribute("src");
        probe.load();
      };

      const onLoaded = () => {
        const w = probe.videoWidth;
        const h = probe.videoHeight;
        cleanup();
        if (
          typeof w === "number" &&
          typeof h === "number" &&
          Number.isFinite(w) &&
          Number.isFinite(h) &&
          w > 0 &&
          h > 0
        ) {
          resolve({
            width: Math.round(w),
            height: Math.round(h),
          });
        } else {
          resolve(undefined);
        }
      };

      const onError = () => {
        cleanup();
        resolve(undefined);
      };

      probe.addEventListener("loadedmetadata", onLoaded);
      probe.addEventListener("error", onError);
      probe.src = url;
      probe.load();

      // Guard timeout: 4 seconds
      setTimeout(() => {
        cleanup();
        resolve(undefined);
      }, 4000);
    } catch {
      resolve(undefined);
    }
  });
}

/** Upper bound for a preview/exported video URL of sane length. */
export const MAX_PREVIEW_URL_LENGTH = 2048;

/**
 * Allow only http(s) video URLs of sane length. Everything else —
 * `javascript:`, `data:`, protocol-relative, relative, or short/garbage
 * strings — is rejected so untrusted `?video=` params can never reach the
 * player, `fetch`, or `window.open` sinks.
 */
export function isSafePreviewUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const url = value.trim();
  if (url.length < 10 || url.length > MAX_PREVIEW_URL_LENGTH) {
    return false;
  }
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!parsed.hostname) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Render the container label for a video URL without ever throwing — the
 * previous `split(".")[3]` crashed on short strings and URLs without dots.
 */
export function getVideoFormatLabel(videoUrl: string): string {
  try {
    if (typeof videoUrl !== "string" || !isSafePreviewUrl(videoUrl)) {
      return "Unknown";
    }
    const withoutQuery = videoUrl.split("?")[0].split("#")[0];
    const lastSegment = withoutQuery.split("/").pop() ?? "";
    const dot = lastSegment.lastIndexOf(".");
    if (dot === -1 || dot === lastSegment.length - 1) {
      return "Unknown";
    }
    const ext = lastSegment.slice(dot + 1).toLowerCase();
    if (!/^[a-z0-9]{2,5}$/.test(ext)) {
      return "Unknown";
    }
    return ext.toUpperCase();
  } catch {
    return "Unknown";
  }
}

export function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export async function downloadVideoAs(videoUrl: string, filename: string): Promise<void> {
  if (!isSafePreviewUrl(videoUrl)) {
    throw new Error("Blocked unsafe video URL");
  }
  const response = await fetch(videoUrl);
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  window.URL.revokeObjectURL(url);
}

/**
 * Strict media type allowlist for direct-to-storage uploads.
 *
 * The upload route signs a PUT with a client-supplied Content-Type and derives
 * the object suffix from it. A broad `image/*` check allows `image/svg+xml`,
 * which can carry script and execute in our origin when served back. Keeping
 * the allowlist here gives every caller the same answer and keeps the suffix
 * derived from a verified type rather than from a client filename.
 */
const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "video/x-m4v": "m4v",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
};

/** Returns the canonical allowlisted MIME type, or null for anything else. */
export function normalizedMediaType(raw: string): string | null {
  const base = raw.split(";")[0].trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(MEDIA_EXTENSIONS, base) ? base : null;
}

/** Object suffix for an allowlisted MIME type. Callers must validate first. */
export function mediaExtensionFor(mime: string): string {
  return MEDIA_EXTENSIONS[mime];
}

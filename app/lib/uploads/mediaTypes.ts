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

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBM_SIGNATURE = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const GIF87A = Buffer.from("GIF87a", "ascii");
const GIF89A = Buffer.from("GIF89a", "ascii");
const RIFF = Buffer.from("RIFF", "ascii");
const WEBP = Buffer.from("WEBP", "ascii");
const FTYP = Buffer.from("ftyp", "ascii");

/**
 * Sniff a MIME type from the leading bytes of an object. Returns null when the
 * bytes do not carry a recognised signature, so callers must fail closed.
 *
 * This intentionally covers only the raster types we serve inline. SVG, HTML
 * and other script-bearing content have no signature here, so they cannot be
 * mistaken for an approved image type.
 */
export function detectMediaMime(buffer: Buffer): string | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) {
    return null;
  }

  // JPEG: FF D8 FF (SOI marker followed by a marker prefix).
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "image/png";
  }

  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).equals(GIF87A) || buffer.subarray(0, 6).equals(GIF89A))
  ) {
    return "image/gif";
  }

  // WebP requires both the RIFF container and the WEBP chunk marker.
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(RIFF) &&
    buffer.subarray(8, 12).equals(WEBP)
  ) {
    return "image/webp";
  }

  // ISO BMFF: the `ftyp` box type always sits at offset 4.
  if (buffer.length >= 12 && buffer.subarray(4, 8).equals(FTYP)) {
    return "video/mp4";
  }

  // EBML magic used by WebM (and Matroska).
  if (buffer.subarray(0, 4).equals(WEBM_SIGNATURE)) {
    return "video/webm";
  }

  return null;
}

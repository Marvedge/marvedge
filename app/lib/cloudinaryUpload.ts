// Unsigned Cloudinary upload helper (testing mode).
//
// The shared API key on this account lacks upload ("create") permission, but
// unsigned uploads through the `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` preset
// are allowed. Uses native fetch/FormData — no SDK signing involved.

const CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
  process.env.CLOUDINARY_CLOUD_NAME ||
  "";
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

export function getCloudinaryCloudName(): string {
  return (
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    CLOUD_NAME
  );
}

export function getCloudinaryUploadPreset(): string {
  return process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || UPLOAD_PRESET;
}

export function isCloudinaryUploadConfigured(): boolean {
  return Boolean(getCloudinaryCloudName() && getCloudinaryUploadPreset());
}

/** Local feature flag to control editor video upload to Cloudinary (Task-00044). */
export function isEditorCloudinaryUploadEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EDITOR_CLOUDINARY_VIDEO_UPLOAD === "true";
}

export type CloudinaryResourceType = "video" | "image" | "raw";

export type SniffedMediaKind = "video" | "audio" | "image" | null;

/**
 * Sniff the real media kind from magic bytes — never trust the filename or
 * the client-reported Content-Type. Returns `null` when the bytes do not
 * look like a supported video, audio, or image container (e.g. an HTML file
 * renamed to `.mp4`).
 */
export function sniffMediaKind(header: Uint8Array): SniffedMediaKind {
  if (!header || header.length < 4) {
    return null;
  }
  const ascii = (start: number, length: number): string => {
    let out = "";
    for (let i = start; i < start + length && i < header.length; i++) {
      out += String.fromCharCode(header[i]);
    }
    return out;
  };

  // EBML: WebM / Matroska (the recorder's output and .mkv uploads).
  if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) {
    return "video";
  }
  // ISO BMFF: MP4 / MOV / M4A (`ftyp` box at offset 4). M4A audio shares this
  // container and uploads to Cloudinary's `video` resource type, so both map
  // to "video" here — the point is rejecting non-media, not distinguishing.
  if (header.length >= 8 && ascii(4, 4) === "ftyp") {
    return "video";
  }
  // RIFF containers: AVI / WAV / WebP.
  if (ascii(0, 4) === "RIFF" && header.length >= 12) {
    const form = ascii(8, 4);
    if (form === "AVI ") {
      return "video";
    }
    if (form === "WAVE") {
      return "audio";
    }
    if (form === "WEBP") {
      return "image";
    }
    return null;
  }
  // Ogg (Vorbis / Opus audio).
  if (ascii(0, 4) === "OggS") {
    return "audio";
  }
  // MP3: ID3v2 tag or MPEG frame sync (also matches raw AAC ADTS frames).
  if (ascii(0, 3) === "ID3") {
    return "audio";
  }
  if (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) {
    return "audio";
  }
  // FLV video.
  if (ascii(0, 3) === "FLV") {
    return "video";
  }
  // Images (kept for the generic path; the video-only entry rejects them).
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "image";
  }
  if (header[0] === 0x89 && ascii(1, 3) === "PNG") {
    return "image";
  }
  if (ascii(0, 4) === "GIF8") {
    return "image";
  }
  if (ascii(0, 2) === "BM") {
    return "image";
  }
  return null;
}

const UPLOAD_HEADER_BYTES = 32;

async function readUploadHeader(file: File | Blob | Buffer): Promise<Uint8Array> {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
    return new Uint8Array((file as Buffer).subarray(0, UPLOAD_HEADER_BYTES));
  }
  const blob = file as Blob;
  if (blob && typeof blob.slice === "function" && typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.slice(0, UPLOAD_HEADER_BYTES).arrayBuffer());
  }
  throw new CloudinaryUploadError("Unable to inspect upload content", 400);
}

/** Reject anything that is not sniffed video/audio (plus image when allowed). */
function assertAllowedMediaBytes(header: Uint8Array, opts: { allowImage: boolean }): void {
  const kind = sniffMediaKind(header);
  if (kind === "video" || kind === "audio") {
    return;
  }
  if (kind === "image" && opts.allowImage) {
    return;
  }
  throw new CloudinaryUploadError(
    "Upload rejected: file content is not a supported video or audio file",
    400
  );
}

export function cloudinaryResourceTypeFor(
  contentType: string,
  filename?: string
): CloudinaryResourceType {
  const normalized = (contentType || "").toLowerCase();
  if (normalized.startsWith("video/") || normalized.startsWith("audio/")) {
    return "video";
  }
  if (normalized.startsWith("image/")) {
    return "image";
  }
  if (filename) {
    const lower = filename.toLowerCase();
    if (
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".mov") ||
      lower.endsWith(".mkv") ||
      lower.endsWith(".avi")
    ) {
      return "video";
    }
  }
  return "raw";
}

export class CloudinaryUploadError extends Error {
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "CloudinaryUploadError";
    this.status = status;
  }
}

export interface CloudinaryUploadOptions {
  file?: File | Blob;
  folder?: string;
  filename?: string;
  contentType?: string;
}

/** Upload a File or Blob directly to Cloudinary via the unsigned preset. Returns the secure URL. */
export async function cloudinaryUpload(
  fileOrOpts: File | Blob | CloudinaryUploadOptions,
  options?: Omit<CloudinaryUploadOptions, "file"> | string
): Promise<string> {
  const cloudName = getCloudinaryCloudName();
  const uploadPreset = getCloudinaryUploadPreset();

  if (!cloudName || !uploadPreset) {
    throw new CloudinaryUploadError(
      "Missing CLOUDINARY_CLOUD_NAME or NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET",
      500
    );
  }

  let file: File | Blob;
  let folder = "uploads";
  let filename: string | undefined;
  let contentType: string | undefined;

  const isBlobLike =
    (typeof Blob !== "undefined" && fileOrOpts instanceof Blob) ||
    (typeof fileOrOpts === "object" &&
      fileOrOpts !== null &&
      "size" in fileOrOpts &&
      typeof (fileOrOpts as Blob).slice === "function");

  if (isBlobLike) {
    file = fileOrOpts as File | Blob;
    if (typeof options === "string") {
      folder = options;
    } else if (options && typeof options === "object") {
      if (options.folder) folder = options.folder;
      if (options.filename) filename = options.filename;
      if (options.contentType) contentType = options.contentType;
    }
  } else if (
    typeof fileOrOpts === "object" &&
    fileOrOpts !== null &&
    "file" in fileOrOpts &&
    fileOrOpts.file
  ) {
    file = fileOrOpts.file;
    if (fileOrOpts.folder) folder = fileOrOpts.folder;
    if (fileOrOpts.filename) filename = fileOrOpts.filename;
    if (fileOrOpts.contentType) contentType = fileOrOpts.contentType;
  } else {
    throw new CloudinaryUploadError("Invalid file or blob provided for upload", 400);
  }

  const resolvedContentType = contentType || file.type || "application/octet-stream";
  const resourceType = cloudinaryResourceTypeFor(resolvedContentType, filename);

  // Neutralize the "raw" fallthrough: unsigned uploads only accept media.
  // Audio legitimately maps to the "video" resource type, so audio callers
  // are unaffected by this gate.
  if (resourceType === "raw") {
    throw new CloudinaryUploadError("Unsupported file type for upload", 400);
  }
  assertAllowedMediaBytes(await readUploadHeader(file as Blob | Buffer), {
    allowImage: resourceType === "image",
  });

  const form = new FormData();
  form.append("upload_preset", uploadPreset);
  if (folder) {
    form.append("folder", folder);
  }
  const resolvedFilename =
    filename ||
    (typeof File !== "undefined" && file instanceof File ? file.name : "upload");
  form.append("file", file, resolvedFilename);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    { method: "POST", body: form }
  );

  const payload = (await response.json().catch(() => null)) as {
    secure_url?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok || !payload?.secure_url) {
    const message = payload?.error?.message || `Cloudinary upload failed (${response.status})`;
    console.error("[cloudinary] upload failed:", message);
    throw new CloudinaryUploadError(message, response.status === 401 ? 500 : response.status);
  }

  return payload.secure_url;
}

/** Upload a buffer to Cloudinary via the unsigned preset. Returns the secure URL. */
export async function cloudinaryUploadBuffer(opts: {
  buffer: Buffer;
  contentType: string;
  folder: string;
  filename?: string;
}): Promise<string> {
  const blob = new Blob([new Uint8Array(opts.buffer)], { type: opts.contentType });
  return cloudinaryUpload(blob, {
    folder: opts.folder,
    filename: opts.filename || "upload",
    contentType: opts.contentType,
  });
}

/** Upload a video file or blob to Cloudinary via the unsigned preset directly from the browser. */
export async function uploadVideoToCloudinary(opts: {
  file: Blob | File;
  folder?: string;
  filename?: string;
}): Promise<string> {
  if (!isCloudinaryUploadConfigured()) {
    throw new CloudinaryUploadError(
      "Missing CLOUDINARY_CLOUD_NAME or NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET",
      500
    );
  }

  const cloudName = getCloudinaryCloudName();
  const uploadPreset = getCloudinaryUploadPreset();
  const folder = opts.folder || "marvedge/editor_uploads";
  const filename = opts.filename || (opts.file instanceof File ? opts.file.name : "upload.mp4");
  const contentType = opts.file.type || "video/mp4";
  const resourceType = cloudinaryResourceTypeFor(contentType, filename);

  // Video-only entry point: the "raw"/"image" fallthrough is neutralized here.
  // `audio/*` maps to the "video" resource type above, so legit audio callers
  // still pass this gate and are then verified by magic bytes below.
  if (resourceType !== "video") {
    throw new CloudinaryUploadError("Only video uploads are supported", 400);
  }
  assertAllowedMediaBytes(await readUploadHeader(opts.file), { allowImage: false });

  const form = new FormData();
  form.append("upload_preset", uploadPreset);
  form.append("folder", folder);
  form.append("file", opts.file, filename);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    { method: "POST", body: form }
  );

  const payload = (await response.json().catch(() => null)) as {
    secure_url?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok || !payload?.secure_url) {
    const message = payload?.error?.message || `Cloudinary upload failed (${response.status})`;
    console.error("[cloudinary] upload failed:", message);
    throw new CloudinaryUploadError(message, response.status === 401 ? 500 : response.status);
  }

  return payload.secure_url;
}

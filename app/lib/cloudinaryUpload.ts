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

// Unsigned Cloudinary upload helper (testing mode).
//
// The shared API key on this account lacks upload ("create") permission, but
// unsigned uploads through the `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` preset
// are allowed. Uses native fetch/FormData â€” no SDK signing involved.

export type CloudinaryResourceType = "video" | "image" | "raw";

export function getCloudinaryCloudName(): string {
  return (
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    ""
  );
}

export function getCloudinaryUploadPreset(): string {
  return (
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ||
    process.env.CLOUDINARY_UPLOAD_PRESET ||
    ""
  );
}

export function isCloudinaryUploadConfigured(): boolean {
  return Boolean(getCloudinaryCloudName() && getCloudinaryUploadPreset());
}

/** Local feature flag to control editor video upload to Cloudinary (Task-00044). */
export function isEditorCloudinaryUploadEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EDITOR_CLOUDINARY_VIDEO_UPLOAD === "true";
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

/** Upload a buffer to Cloudinary via the unsigned preset (server-side Node Buffer). Returns the secure URL. */
export async function cloudinaryUploadBuffer(opts: {
  buffer: Buffer;
  contentType: string;
  folder: string;
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
  const resourceType = cloudinaryResourceTypeFor(opts.contentType, opts.filename);
  const form = new FormData();
  form.append("upload_preset", uploadPreset);
  form.append("folder", opts.folder);
  form.append(
    "file",
    new Blob([new Uint8Array(opts.buffer)], { type: opts.contentType }),
    opts.filename || "upload"
  );

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

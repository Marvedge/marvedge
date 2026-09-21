/**
 * Client-side unsigned Cloudinary upload helper for video blobs.
 *
 * Used by Task-00032 (Auto-Reframe) to convert local browser video blobs into
 * public HTTPS URLs for headless AutoFlip inference without exposing API secrets.
 */

export async function uploadBlobToCloudinary(blob: Blob): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error(
      "Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME or NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"
    );
  }

  const formData = new FormData();
  formData.append("file", blob);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", "reframe_sources");

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  const data = (await response.json().catch(() => null)) as {
    secure_url?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok || !data?.secure_url) {
    const errorDetail =
      data?.error?.message || `Cloudinary upload failed with status ${response.status}`;
    throw new Error(errorDetail);
  }

  return data.secure_url;
}

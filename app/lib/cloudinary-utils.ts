import cloudinary from "@/app/lib/cloudinary";

function extractPublicIdFromCloudinaryUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const marker = "/upload/";
    const uploadIndex = parsed.pathname.indexOf(marker);
    if (uploadIndex === -1) {
      return null;
    }

    const rawAfterUpload = parsed.pathname.slice(uploadIndex + marker.length);
    const parts = rawAfterUpload.split("/").filter(Boolean);
    if (parts.length === 0) {
      return null;
    }

    const versionIndex = parts.findIndex((part) => /^v\d+$/.test(part));
    const assetParts = versionIndex >= 0 ? parts.slice(versionIndex + 1) : parts;
    if (assetParts.length === 0) {
      return null;
    }

    const joined = assetParts.join("/");
    return joined.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
}

export async function deleteCloudinaryVideoByUrl(url: string | null | undefined): Promise<void> {
  if (!url) {
    return;
  }

  const publicId = extractPublicIdFromCloudinaryUrl(url);
  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "video",
      invalidate: true,
    });
  } catch (error) {
    console.error("Cloudinary delete failed:", error);
  }
}

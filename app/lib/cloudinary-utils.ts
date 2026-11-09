import cloudinary from "@/app/lib/cloudinary";

const CLOUDINARY_HOST = "res.cloudinary.com";
const UPLOAD_MARKER = "/upload/";

/**
 * Extract the public id from a URL we are about to DESTROY.
 *
 * Destroy runs with the operator's Cloudinary credentials, so the URL must be
 * proven to point at an asset in OUR cloud before its id is trusted. Anything
 * else — another cloud name, an alternate host or port, a query string, or a
 * percent-encoded path that could decode into a different asset — is refused.
 * The public id is only ever built from the raw path segments after the cloud
 * name prefix, so a crafted URL cannot reach another tenant's asset.
 */
function extractPublicIdFromCloudinaryUrl(url: string): string | null {
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  if (!cloudName) {
    return null;
  }

  // Check the RAW string first: the URL parser normalises `%2e%2e` and `\` into
  // path separators and dot segments, so by the time we inspect `pathname` a
  // smuggling attempt can look like a clean sibling path in our own cloud.
  // Nothing we mint contains either character, so refusing them wholesale is a
  // safe miss.
  if (url.includes("%") || url.includes("\\")) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  // `host` includes a non-default port, so this rejects both alternate hosts and
  // https://res.cloudinary.com:8443/... . An explicit :443 normalises away.
  if (parsed.host !== CLOUDINARY_HOST) {
    return null;
  }

  // Query/hash and legacy backslash separators are not part of an upload URL we
  // minted, and percent-encoding is rejected wholesale because it is the
  // standard way to smuggle a slash or dot past a segment check. A legitimate
  // id containing an encoded character simply is not destroyed — a safe miss.
  if (parsed.search || parsed.hash) {
    return null;
  }
  if (parsed.pathname.includes("\\") || parsed.pathname.includes("%")) {
    return null;
  }

  const prefix = `/${cloudName}/`;
  if (!parsed.pathname.startsWith(prefix)) {
    return null;
  }

  const uploadIndex = parsed.pathname.indexOf(UPLOAD_MARKER, prefix.length - 1);
  if (uploadIndex === -1) {
    return null;
  }

  const rawAfterUpload = parsed.pathname.slice(uploadIndex + UPLOAD_MARKER.length);
  const parts = rawAfterUpload.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    return null;
  }

  const versionIndex = parts.findIndex((part) => /^v\d+$/.test(part));
  const assetParts = versionIndex >= 0 ? parts.slice(versionIndex + 1) : parts;
  if (assetParts.length === 0) {
    return null;
  }

  const joined = assetParts.join("/");
  const withoutExtension = joined.replace(/\.[^/.]+$/, "");
  if (!withoutExtension || withoutExtension.startsWith("/") || withoutExtension.includes("../")) {
    return null;
  }
  return withoutExtension;
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

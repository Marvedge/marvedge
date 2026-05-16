export type GcsUploadKind =
  | "demo-source"
  | "export-source"
  | "background"
  | "subtitle-source"
  | "generic";

type GcsUploadResponse = {
  ok: boolean;
  url?: string;
  publicUrl?: string;
  signedReadUrl?: string;
  uploadUrl?: string;
  object?: string;
  bucket?: string;
  error?: string;
};

export async function uploadBlobToGcs({
  blob,
  filename,
  kind,
}: {
  blob: Blob;
  filename: string;
  kind: GcsUploadKind;
}): Promise<{
  url: string;
  publicUrl?: string;
  object?: string;
  bucket?: string;
}> {
  // 1) Ask backend for a signed upload URL.
  const signedResponse = await fetch("/api/gcs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename,
      contentType: blob.type || "application/octet-stream",
      kind,
    }),
  });

  const body = (await signedResponse.json().catch(() => ({}))) as GcsUploadResponse;

  if (!signedResponse.ok || !body.ok || !body.url || !body.uploadUrl) {
    throw new Error(body.error || `GCS upload init failed (${signedResponse.status})`);
  }

  // 2) Upload bytes directly from browser to GCS (no function payload limits).
  const putResponse = await fetch(body.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
    },
    body: blob,
  });

  if (!putResponse.ok) {
    throw new Error(`Direct GCS upload failed (${putResponse.status})`);
  }

  return {
    url: body.url,
    publicUrl: body.publicUrl || body.signedReadUrl,
    object: body.object,
    bucket: body.bucket,
  };
}

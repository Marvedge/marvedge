export type GcsUploadKind =
  | "demo-source"
  | "export-source"
  | "background"
  // WTM: a PRO user's custom watermark PNG (app/components/editorSidebar/wtm).
  | "watermark"
  // WTM: the webcam clip captured alongside a screen recording (WTM-6.4).
  | "webcam-source"
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
      // Declared up front so the route can refuse an oversized video BEFORE a
      // signed URL exists, rather than after the browser has pushed gigabytes
      // straight into the bucket.
      size: blob.size,
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

  // 3) Ask the backend to confirm the bytes that landed fit the cap. The
  // declared size in step 1 is what the client SAID it would send; this is
  // the control that measures what actually arrived and removes oversize
  // objects. Honest uploads pass through untouched.
  const verifyResponse = await fetch("/api/gcs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verify", object: body.object }),
  });

  const verifyBody = (await verifyResponse.json().catch(() => ({}))) as GcsUploadResponse;

  if (!verifyResponse.ok || !verifyBody.ok) {
    throw new Error(
      verifyBody.error || `GCS upload verification failed (${verifyResponse.status})`
    );
  }

  return {
    url: body.url,
    publicUrl: body.publicUrl || body.signedReadUrl,
    object: body.object,
    bucket: body.bucket,
  };
}

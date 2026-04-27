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
  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("kind", kind);

  const response = await fetch("/api/gcs/upload", {
    method: "POST",
    body: formData,
  });

  const body = (await response.json().catch(() => ({}))) as GcsUploadResponse;

  if (!response.ok || !body.ok || !body.url) {
    throw new Error(body.error || `GCS upload failed (${response.status})`);
  }

  return {
    url: body.url,
    publicUrl: body.publicUrl,
    object: body.object,
    bucket: body.bucket,
  };
}

type BoundedFormDataResult =
  | { ok: true; value: FormData }
  | {
      ok: false;
      reason: "too_large" | "unreadable" | "invalid_form_data";
    };

export async function readBoundedRequestFormData(
  request: Request,
  maxBytes: number
): Promise<BoundedFormDataResult> {
  if (!request.body) {
    return { ok: false, reason: "invalid_form_data" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const chunk = await reader.read();

      if (chunk.done) {
        break;
      }

      bytesRead += chunk.value.byteLength;

      if (bytesRead > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }

      chunks.push(chunk.value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }

  // Preserve binary file bytes. Only parse after the entire body fits.
  const bytes = new Uint8Array(bytesRead);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  chunks.length = 0;

  try {
    const headers = new Headers();
    const contentType = request.headers.get("content-type");

    if (contentType) {
      headers.set("content-type", contentType);
    }

    const value = await new Response(bytes, { headers }).formData();

    return { ok: true, value };
  } catch {
    return { ok: false, reason: "invalid_form_data" };
  }
}

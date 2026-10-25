import type { BoundedBodyResult } from "./boundedBody";

export async function readBoundedRequestBytes(
  request: Request,
  maxBytes: number
): Promise<BoundedBodyResult<Uint8Array>> {
  if (!request.body) {
    return { ok: false, reason: "empty" };
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

  if (bytesRead === 0) {
    return { ok: false, reason: "empty" };
  }

  const bytes = new Uint8Array(bytesRead);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, value: bytes };
}

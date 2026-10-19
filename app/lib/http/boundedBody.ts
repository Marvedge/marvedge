export type BoundedBodyFailure = "empty" | "too_large" | "unreadable" | "invalid_json";

export type BoundedBodyResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      reason: BoundedBodyFailure;
    };

function declaredBodyIsTooLarge(request: Request, maxBytes: number): boolean {
  const header = request.headers.get("content-length");

  if (!header) {
    return false;
  }

  const declaredBytes = Number.parseInt(header, 10);

  return Number.isFinite(declaredBytes) && declaredBytes > maxBytes;
}

export async function readBoundedRequestText(
  request: Request,
  maxBytes: number
): Promise<BoundedBodyResult<string>> {
  if (declaredBodyIsTooLarge(request, maxBytes)) {
    return {
      ok: false,
      reason: "too_large",
    };
  }

  if (!request.body) {
    return {
      ok: false,
      reason: "empty",
    };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const chunk = await reader.read();

      if (chunk.done) {
        break;
      }

      bytesRead += chunk.value.byteLength;

      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => undefined);

        return {
          ok: false,
          reason: "too_large",
        };
      }

      text += decoder.decode(chunk.value, {
        stream: true,
      });
    }

    text += decoder.decode();
  } catch {
    return {
      ok: false,
      reason: "unreadable",
    };
  } finally {
    reader.releaseLock();
  }

  if (bytesRead === 0) {
    return {
      ok: false,
      reason: "empty",
    };
  }

  return {
    ok: true,
    value: text,
  };
}

export async function readBoundedRequestJson(
  request: Request,
  maxBytes: number
): Promise<BoundedBodyResult<unknown>> {
  const textResult = await readBoundedRequestText(request, maxBytes);

  if (!textResult.ok) {
    return textResult;
  }

  try {
    return {
      ok: true,
      value: JSON.parse(textResult.value) as unknown,
    };
  } catch {
    return {
      ok: false,
      reason: "invalid_json",
    };
  }
}

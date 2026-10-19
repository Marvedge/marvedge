import { describe, expect, it } from "vitest";

import { readBoundedRequestJson, readBoundedRequestText } from "./boundedBody";

function streamingRequest(chunks: string[], headers?: HeadersInit): Request {
  const encoder = new TextEncoder();
  let index = 0;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(chunks[index]));

      index += 1;
    },
  });

  return new Request("http://localhost/test", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit & {
    duplex: "half";
  });
}

describe("bounded request-body reader", () => {
  it("accepts a streamed body exactly at the byte limit", async () => {
    const request = streamingRequest(["€", "a"]);

    await expect(readBoundedRequestText(request, 4)).resolves.toEqual({
      ok: true,
      value: "€a",
    });
  });

  it("rejects a declared body larger than the limit", async () => {
    const request = streamingRequest(["small"], {
      "content-length": "100",
    });

    await expect(readBoundedRequestText(request, 10)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("stops a streamed body that exceeds the limit without a length header", async () => {
    const request = streamingRequest(["1234", "5678"]);

    await expect(readBoundedRequestText(request, 7)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("parses valid bounded JSON", async () => {
    const request = streamingRequest(['{"demoId":"demo-1"}']);

    await expect(readBoundedRequestJson(request, 64)).resolves.toEqual({
      ok: true,
      value: {
        demoId: "demo-1",
      },
    });
  });

  it("rejects invalid JSON without throwing", async () => {
    const request = streamingRequest(['{"demoId":']);

    await expect(readBoundedRequestJson(request, 64)).resolves.toEqual({
      ok: false,
      reason: "invalid_json",
    });
  });
});

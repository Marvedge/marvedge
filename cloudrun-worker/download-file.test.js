import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { downloadFile } from "./render.js";

function publicLookup() {
  return vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
}

function makeResponse(status, location, body = "bytes") {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === "location") {
          return location ?? null;
        }
        return null;
      },
    },
    arrayBuffer: async () => Buffer.from(body),
  };
}

function tmpPath(name) {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "dl-test-")),
    name
  );
}

describe("render downloadFile hardening", () => {
  it("writes the response body for a safe URL", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(200, null, "png-bytes"));
    const dest = tmpPath("bg.png");
    await downloadFile("https://media.example.test/bg.png", dest, {
      fetchImpl,
      lookupImpl: publicLookup(),
    });
    expect(fs.readFileSync(dest, "utf8")).toBe("png-bytes");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses a link-local URL before fetching", async () => {
    const fetchImpl = vi.fn();
    const dest = tmpPath("meta");
    await expect(
      downloadFile("http://169.254.169.254/latest/meta-data", dest, {
        fetchImpl,
        lookupImpl: publicLookup(),
      })
    ).rejects.toThrow(/blocked host/i);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fs.existsSync(dest)).toBe(false);
  });

  it("refuses non-http(s) schemes before fetching", async () => {
    const fetchImpl = vi.fn();
    await expect(
      downloadFile("file:///etc/passwd", tmpPath("x"), {
        fetchImpl,
        lookupImpl: publicLookup(),
      })
    ).rejects.toThrow(/non-http/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stops a redirect loop at the max-redirects cap", async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse(302, "https://media.example.test/loop")
    );
    await expect(
      downloadFile("https://media.example.test/loop", tmpPath("loop"), {
        fetchImpl,
        lookupImpl: publicLookup(),
        maxRedirects: 2,
      })
    ).rejects.toThrow(/too many.*redirects/i);
    // Initial request + 2 allowed redirects.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("refuses a safe URL redirecting to link-local", async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse(302, "http://169.254.169.254/latest/meta-data")
    );
    await expect(
      downloadFile("https://media.example.test/start.png", tmpPath("x"), {
        fetchImpl,
        lookupImpl: publicLookup(),
      })
    ).rejects.toThrow(/blocked host/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects non-2xx responses", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(404, null));
    await expect(
      downloadFile("https://media.example.test/missing.png", tmpPath("x"), {
        fetchImpl,
        lookupImpl: publicLookup(),
      })
    ).rejects.toThrow(/download failed: 404/i);
  });

  it("streams a body without buffering it all first", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(Buffer.from("chunk-one-"));
        c.enqueue(Buffer.from("chunk-two"));
        c.close();
      },
    });
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      body: stream,
    }));
    const dest = tmpPath("streamed.png");
    await downloadFile("https://media.example.test/stream.png", dest, {
      fetchImpl,
      lookupImpl: publicLookup(),
    });
    expect(fs.readFileSync(dest, "utf8")).toBe("chunk-one-chunk-two");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("streams many unknown-length chunks to a temp file without Buffer.concat (no 2x peak)", async () => {
    const chunkCount = 200;
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < chunkCount; i += 1) {
          c.enqueue(Buffer.alloc(100, 7));
        }
        c.close();
      },
    });
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      body: stream,
    }));
    const dest = tmpPath("many.bin");
    const concatSpy = vi.spyOn(Buffer, "concat");

    await downloadFile("https://media.example.test/many.bin", dest, {
      fetchImpl,
      lookupImpl: publicLookup(),
      maxBytes: 100_000,
    });

    expect(fs.statSync(dest).size).toBe(chunkCount * 100);
    expect(concatSpy).not.toHaveBeenCalled();
    concatSpy.mockRestore();
    expect(fs.readdirSync(path.dirname(dest))).toEqual([path.basename(dest)]);
  });

  it("rejects an oversized Content-Length before reading the body", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(Buffer.alloc(16, 7));
        c.close();
      },
    });
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      ok: true,
      headers: {
        get(name) {
          return String(name).toLowerCase() === "content-length" ? "5000" : null;
        },
      },
      body: stream,
    }));
    const dest = tmpPath("too-big.png");

    await expect(
      downloadFile("https://media.example.test/big.png", dest, {
        fetchImpl,
        lookupImpl: publicLookup(),
        maxBytes: 10,
      })
    ).rejects.toThrow(/content-length/i);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it("aborts a streamed body past the cap and writes nothing", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(Buffer.alloc(16, 7));
        c.close();
      },
    });
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      body: stream,
    }));
    const dest = tmpPath("too-big.png");
    await expect(
      downloadFile("https://media.example.test/big.png", dest, {
        fetchImpl,
        lookupImpl: publicLookup(),
        maxBytes: 10,
      })
    ).rejects.toThrow(/size limit/i);
    expect(fs.existsSync(dest)).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import safeDownload from "./safe-download.cjs";

const {
  fetchSafeUrl,
  isBlockedAddress,
  isBlockedWorkerHost,
  isSafeRecipeId,
  readPositiveIntEnv,
  writeCappedResponseBody,
} = safeDownload;

function tmpDest(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cr-dl-")), name);
}

function makeResponse(status, location) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        if (name.toLowerCase() === "location") {
          return location ?? null;
        }

        return null;
      },
    },
  };
}

function makePublicLookup() {
  return vi.fn(async () => [
    {
      address: "93.184.216.34",
      family: 4,
    },
  ]);
}

describe("Cloud Run safe URL downloader", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("blocks private address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "localhost",
    "service",
    "service.local",
    "metadata.internal",
    "127.0.0.1",
    "169.254.169.254",
    "::1",
  ])("blocks unsafe hostname %s", (hostname) => {
    expect(isBlockedWorkerHost(hostname)).toBe(true);
  });

  it("allows a valid public response", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(200));

    const response = await fetchSafeUrl("https://media.example.test/video.mp4", {
      fetchImpl,
      lookupImpl: makePublicLookup(),
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith("https://media.example.test/video.mp4", {
      redirect: "manual",
    });
  });

  it("blocks a direct cloud metadata request before fetching", async () => {
    const fetchImpl = vi.fn();

    await expect(
      fetchSafeUrl("http://169.254.169.254/latest/meta-data", {
        fetchImpl,
        lookupImpl: makePublicLookup(),
      })
    ).rejects.toThrow("blocked host");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks a public URL redirecting to cloud metadata", async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse(302, "http://169.254.169.254/latest/meta-data")
    );

    await expect(
      fetchSafeUrl("https://media.example.test/video.mp4", {
        fetchImpl,
        lookupImpl: makePublicLookup(),
      })
    ).rejects.toThrow("blocked host");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("blocks a hostname resolving to a private address", async () => {
    const fetchImpl = vi.fn();
    const privateLookup = vi.fn(async () => [
      {
        address: "10.0.0.8",
        family: 4,
      },
    ]);

    await expect(
      fetchSafeUrl("https://malicious.example.test/video.mp4", {
        fetchImpl,
        lookupImpl: privateLookup,
      })
    ).rejects.toThrow("private address");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("validates and follows a safe relative redirect", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(302, "/final-video.mp4"))
      .mockResolvedValueOnce(makeResponse(200));

    const response = await fetchSafeUrl("https://media.example.test/start-video.mp4", {
      fetchImpl,
      lookupImpl: makePublicLookup(),
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "https://media.example.test/final-video.mp4", {
      redirect: "manual",
    });
  });

  it("stops redirect loops", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(302, "https://media.example.test/again"));

    await expect(
      fetchSafeUrl("https://media.example.test/start", {
        fetchImpl,
        lookupImpl: makePublicLookup(),
        maxRedirects: 2,
      })
    ).rejects.toThrow("Too many source URL redirects");

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("readPositiveIntEnv", () => {
  const ENV_NAME = "MARVEDGE_TEST_POSITIVE_INT";

  afterEach(() => {
    delete process.env[ENV_NAME];
  });

  it.each(["Infinity", "-Infinity", "NaN", "0", "-1", "abc", "", "  "])(
    "falls back for invalid value %s",
    (value) => {
      process.env[ENV_NAME] = value;
      expect(readPositiveIntEnv(ENV_NAME, 42)).toBe(42);
    }
  );

  it("uses a valid positive integer", () => {
    process.env[ENV_NAME] = "1024";
    expect(readPositiveIntEnv(ENV_NAME, 42)).toBe(1024);
  });

  it("falls back for non-integers unless fractions are explicitly allowed", () => {
    process.env[ENV_NAME] = "1.25";
    expect(readPositiveIntEnv(ENV_NAME, 42)).toBe(42);
    expect(readPositiveIntEnv(ENV_NAME, 42, { allowFraction: true })).toBe(1.25);
  });

  it("falls back when unset", () => {
    expect(readPositiveIntEnv(ENV_NAME, 42)).toBe(42);
  });
});

describe("isSafeRecipeId", () => {
  it.each(["recipe123", "a-b_c", "A1_b-2", "x".repeat(128)])(
    "accepts allowlisted id %s",
    (value) => {
      expect(isSafeRecipeId(value)).toBe(true);
    }
  );

  it.each([
    "../../../app/something",
    "../evil",
    "..",
    "/etc/passwd",
    "C:\\Windows\\x",
    "a/b",
    "a\\b",
    "recipe.mp4",
    "",
    "x".repeat(129),
  ])("rejects unsafe id %s", (value) => {
    expect(isSafeRecipeId(value)).toBe(false);
  });

  it("rejects non-string ids", () => {
    expect(isSafeRecipeId(undefined)).toBe(false);
    expect(isSafeRecipeId(null)).toBe(false);
    expect(isSafeRecipeId(42)).toBe(false);
  });
});

describe("writeCappedResponseBody", () => {
  function responseWithStream(stream, headers = {}) {
    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return headers[String(name).toLowerCase()] ?? null;
        },
      },
      body: stream,
    };
  }

  it("rejects an oversized Content-Length before reading and cancels the body", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const dest = tmpDest("tts.mp3");

    await expect(
      writeCappedResponseBody(
        responseWithStream(stream, { "content-length": "5000" }),
        dest,
        1024
      )
    ).rejects.toThrow(/content-length/i);

    expect(cancelled).toBe(true);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it("streams a capped body to disk without buffering the whole response", async () => {
    const chunks = Array.from({ length: 200 }, () => Buffer.alloc(100, 7));
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
    const dest = tmpDest("many-chunks.bin");
    const concatSpy = vi.spyOn(Buffer, "concat");

    await writeCappedResponseBody(responseWithStream(stream), dest, 100_000);

    expect(fs.statSync(dest).size).toBe(20_000);
    expect(concatSpy).not.toHaveBeenCalled();
    concatSpy.mockRestore();
    // No temp siblings should survive a successful rename.
    expect(fs.readdirSync(path.dirname(dest))).toEqual([path.basename(dest)]);
  });

  it("cancels and removes the temp file when a chunked body exceeds the cap", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.alloc(16, 7));
      },
      cancel() {
        cancelled = true;
      },
    });
    const dest = tmpDest("too-big.bin");

    await expect(
      writeCappedResponseBody(responseWithStream(stream), dest, 10)
    ).rejects.toThrow(/size limit/i);

    expect(cancelled).toBe(true);
    expect(fs.existsSync(dest)).toBe(false);
    expect(fs.readdirSync(path.dirname(dest))).toEqual([]);
  });
});

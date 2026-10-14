import { describe, expect, it, vi } from "vitest";
import safeDownload from "./safe-download.cjs";

const { fetchSafeUrl, isBlockedAddress, isBlockedWorkerHost } = safeDownload;

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

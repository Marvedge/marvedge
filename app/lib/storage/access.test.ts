import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  demo: vi.fn(),
  job: vi.fn(),
  exportedVideo: vi.fn(),
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    demo: { findFirst: mocks.demo },
    videoJob: { findFirst: mocks.job },
    exportedVideo: { findFirst: mocks.exportedVideo },
  },
}));

import { mayResolveObject } from "./access";

const referenceTypes = ["demo", "job", "exportedVideo"] as const;

describe("private upload ownership overrides saved references", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("RAW_BUCKET", "raw-bucket");
    vi.stubEnv("GCP_RAW_BUCKET", "");
    mocks.demo.mockResolvedValue(null);
    mocks.job.mockResolvedValue(null);
    mocks.exportedVideo.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(referenceTypes)(
    "rejects a foreign upload despite an owned %s reference",
    async (referenceType) => {
      mocks[referenceType].mockResolvedValue({ id: "owned-reference" });

      const allowed = await mayResolveObject(
        "gs://raw-bucket/uploads/video/user-2/private.mp4",
        "raw-bucket",
        "uploads/video/user-2/private.mp4",
        "user-1"
      );

      expect(allowed).toBe(false);
      expect(mocks.demo).not.toHaveBeenCalled();
      expect(mocks.job).not.toHaveBeenCalled();
      expect(mocks.exportedVideo).not.toHaveBeenCalled();
    }
  );

  it.each(referenceTypes)(
    "rejects an upload in another bucket despite an owned %s reference",
    async (referenceType) => {
      mocks[referenceType].mockResolvedValue({ id: "owned-reference" });

      await expect(
        mayResolveObject(
          "gs://other-bucket/uploads/video/user-1/private.mp4",
          "other-bucket",
          "uploads/video/user-1/private.mp4",
          "user-1"
        )
      ).resolves.toBe(false);

      expect(mocks[referenceType]).not.toHaveBeenCalled();
    }
  );

  it.each(["s3", "gs"])("allows the caller's upload with a %s URI", async (scheme) => {
    await expect(
      mayResolveObject(
        `${scheme}://raw-bucket/uploads/video/user-1/own.mp4`,
        "raw-bucket",
        "uploads/video/user-1/own.mp4",
        "user-1"
      )
    ).resolves.toBe(true);

    expect(mocks.demo).not.toHaveBeenCalled();
    expect(mocks.job).not.toHaveBeenCalled();
    expect(mocks.exportedVideo).not.toHaveBeenCalled();
  });

  it.each(referenceTypes)(
    "preserves non-upload legacy/output access through an owned %s",
    async (referenceType) => {
      mocks[referenceType].mockResolvedValue({ id: "owned-reference" });

      await expect(
        mayResolveObject(
          "gs://processed-bucket/jobs/finished.mp4",
          "processed-bucket",
          "jobs/finished.mp4",
          "user-1"
        )
      ).resolves.toBe(true);
    }
  );

  it("rejects upload access when no upload bucket is configured", async () => {
    vi.stubEnv("RAW_BUCKET", "");
    vi.stubEnv("GCP_RAW_BUCKET", "");
    mocks.demo.mockResolvedValue({ id: "owned-reference" });

    await expect(
      mayResolveObject(
        "gs://raw-bucket/uploads/video/user-1/own.mp4",
        "raw-bucket",
        "uploads/video/user-1/own.mp4",
        "user-1"
      )
    ).resolves.toBe(false);

    expect(mocks.demo).not.toHaveBeenCalled();
  });

  it.each(["uploads", "uploads/video/user-1", "uploads//user-1/file.mp4", "uploads/video/user-1/"])(
    "rejects malformed upload path %s despite a saved reference",
    async (key) => {
      mocks.demo.mockResolvedValue({ id: "owned-reference" });

      await expect(
        mayResolveObject(`gs://raw-bucket/${key}`, "raw-bucket", key, "user-1")
      ).resolves.toBe(false);

      expect(mocks.demo).not.toHaveBeenCalled();
    }
  );
});

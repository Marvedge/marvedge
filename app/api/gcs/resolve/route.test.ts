import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  demoFindFirst: vi.fn(),
  videoJobFindFirst: vi.fn(),
  exportedVideoFindFirst: vi.fn(),
  bucket: vi.fn(),
  file: vi.fn(),
  exists: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    demo: {
      findFirst: mocks.demoFindFirst,
    },
    videoJob: {
      findFirst: mocks.videoJobFindFirst,
    },
    exportedVideo: {
      findFirst: mocks.exportedVideoFindFirst,
    },
  },
}));

vi.mock("@google-cloud/storage", () => {
  class Storage {
    bucket(name: string) {
      return mocks.bucket(name);
    }
  }

  return { Storage };
});

import { GET } from "./route";

const previousEnvironment = {
  GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID,
  GOOGLE_CLOUD_CLIENT_EMAIL: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
  GOOGLE_CLOUD_PRIVATE_KEY: process.env.GOOGLE_CLOUD_PRIVATE_KEY,
  GCP_RAW_BUCKET: process.env.GCP_RAW_BUCKET,
  RAW_BUCKET: process.env.RAW_BUCKET,
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
};

function makeRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/gcs/resolve?url=${encodeURIComponent(url)}`);
}

function restoreEnvironmentVariable(name: keyof typeof previousEnvironment): void {
  const previousValue = previousEnvironment[name];

  if (previousValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previousValue;
  }
}

describe("GET /api/gcs/resolve authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.GOOGLE_CLOUD_PROJECT_ID = "qa-project";
    process.env.GOOGLE_CLOUD_CLIENT_EMAIL = "qa-service-account@example.test";
    process.env.GOOGLE_CLOUD_PRIVATE_KEY = "qa-private-key";
    process.env.GCP_RAW_BUCKET = "raw-bucket";
    process.env.STORAGE_PROVIDER = "gcs";
    delete process.env.RAW_BUCKET;

    mocks.getServerSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "owner@example.test",
      },
    });

    mocks.userFindUnique.mockResolvedValue(null);
    mocks.demoFindFirst.mockResolvedValue(null);
    mocks.videoJobFindFirst.mockResolvedValue(null);
    mocks.exportedVideoFindFirst.mockResolvedValue(null);

    mocks.exists.mockResolvedValue([true]);
    mocks.getSignedUrl.mockResolvedValue(["https://storage.googleapis.com/signed-owned-object"]);

    mocks.file.mockReturnValue({
      exists: mocks.exists,
      getSignedUrl: mocks.getSignedUrl,
    });

    mocks.bucket.mockReturnValue({
      file: mocks.file,
    });
  });

  afterAll(() => {
    restoreEnvironmentVariable("GOOGLE_CLOUD_PROJECT_ID");
    restoreEnvironmentVariable("GOOGLE_CLOUD_CLIENT_EMAIL");
    restoreEnvironmentVariable("GOOGLE_CLOUD_PRIVATE_KEY");
    restoreEnvironmentVariable("GCP_RAW_BUCKET");
    restoreEnvironmentVariable("RAW_BUCKET");
    restoreEnvironmentVariable("STORAGE_PROVIDER");
  });

  it("returns 401 when the user is not authenticated", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const response = await GET(makeRequest("gs://raw-bucket/uploads/video/user-1/video.mp4"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Unauthorized",
    });
    expect(mocks.bucket).not.toHaveBeenCalled();
  });

  it("resolves an upload belonging to the authenticated user", async () => {
    const inputUrl = "gs://raw-bucket/uploads/video/user-1/recording.mp4";

    const response = await GET(makeRequest(inputUrl));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      playableUrl: "https://storage.googleapis.com/signed-owned-object",
      sourceUrl: inputUrl,
    });

    expect(mocks.bucket).toHaveBeenCalledWith("raw-bucket");
    expect(mocks.file).toHaveBeenCalledWith("uploads/video/user-1/recording.mp4");
    expect(mocks.getSignedUrl).toHaveBeenCalledWith({
      version: "v4",
      action: "read",
      expires: expect.any(Number),
    });
  });

  it("does not sign another user's uploaded object", async () => {
    const response = await GET(
      makeRequest("gs://raw-bucket/uploads/video/user-2/private-recording.mp4")
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Source video object not found in storage",
    });

    expect(mocks.bucket).not.toHaveBeenCalled();
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("does not sign an arbitrary object in the configured bucket", async () => {
    const response = await GET(makeRequest("gs://raw-bucket/internal/private-video.mp4"));

    expect(response.status).toBe(404);
    expect(mocks.bucket).not.toHaveBeenCalled();
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("does not sign an arbitrary object from another bucket", async () => {
    const response = await GET(makeRequest("gs://private-company-bucket/finance/archive.mp4"));

    expect(response.status).toBe(404);
    expect(mocks.bucket).not.toHaveBeenCalled();
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("allows a legacy GCS object referenced by the user's Demo", async () => {
    const inputUrl = "gs://legacy-video-bucket/legacy/user-video.mp4";

    mocks.demoFindFirst.mockResolvedValue({ id: "demo-1" });

    const response = await GET(makeRequest(inputUrl));

    expect(response.status).toBe(200);
    expect(mocks.demoFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        OR: [{ videoUrl: inputUrl }, { exportedUrl: inputUrl }],
      },
      select: { id: true },
    });
    expect(mocks.bucket).toHaveBeenCalledWith("legacy-video-bucket");
  });

  it("allows a GCS object referenced by the user's VideoJob", async () => {
    const inputUrl = "gs://processed-bucket/jobs/user-result.mp4";

    mocks.videoJobFindFirst.mockResolvedValue({ id: "job-1" });

    const response = await GET(makeRequest(inputUrl));

    expect(response.status).toBe(200);
    expect(mocks.bucket).toHaveBeenCalledWith("processed-bucket");
  });

  it("allows a GCS object referenced by the user's ExportedVideo", async () => {
    const inputUrl = "gs://exports-bucket/final/exported-video.mp4";

    mocks.exportedVideoFindFirst.mockResolvedValue({
      id: "exported-video-1",
    });

    const response = await GET(makeRequest(inputUrl));

    expect(response.status).toBe(200);
    expect(mocks.bucket).toHaveBeenCalledWith("exports-bucket");
  });

  it("uses the database user ID when the session only contains email", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: {
        email: "owner@example.test",
      },
    });

    mocks.userFindUnique.mockResolvedValue({
      id: "database-user-1",
    });

    const response = await GET(
      makeRequest("gs://raw-bucket/uploads/video/database-user-1/video.mp4")
    );

    expect(response.status).toBe(200);
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { email: "owner@example.test" },
      select: { id: true },
    });
  });

  it("preserves non-GCS URL passthrough behaviour", async () => {
    const inputUrl = "https://cdn.example.test/video.mp4";

    const response = await GET(makeRequest(inputUrl));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      playableUrl: inputUrl,
    });
    expect(mocks.bucket).not.toHaveBeenCalled();
  });
});

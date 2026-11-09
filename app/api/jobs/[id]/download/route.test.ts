import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    videoJob: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/elevenlabs/dubbing", () => ({
  getDubbedAudio: vi.fn(),
  getAudioExtension: vi.fn((contentType: string) => {
    if (contentType === "audio/wav") {
      return "wav";
    }
    return "mp3";
  }),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { getDubbedAudio } from "@/app/lib/elevenlabs/dubbing";
import { GET } from "./route";

function makeRequest(
  id: string,
  search = ""
): {
  req: NextRequest;
  context: { params: Promise<{ id: string }> };
} {
  const url = `http://localhost:3000/api/jobs/${id}/download${search}`;
  const req = new NextRequest(url, { method: "GET" });
  const context = { params: Promise.resolve({ id }) };
  return { req, context };
}

describe("GET /api/jobs/[id]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user-123",
        email: "test@example.com",
      },
    } as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(401);
  });

  it("returns 404 when job does not exist", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(null);

    const { req, context } = makeRequest("job-missing");
    const res = await GET(req, context);

    expect(res.status).toBe(404);
  });

  it("returns 403 when user does not own the job", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "other-user",
      status: "COMPLETED",
      exportedUrl: "https://example.com/video.mp4",
      jobData: null,
    } as never);

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(403);
  });

  it("returns 400 when DUBBING job is not completed yet", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "PROCESSING",
      exportedUrl: null,
      jobData: {
        kind: "DUBBING",
        dubbingId: "elevenlabs-dub-1",
        targetLanguage: "es",
      },
    } as never);

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Dubbing job is not completed" });
    // Must NOT have called getDubbedAudio for an incomplete job.
    expect(getDubbedAudio).not.toHaveBeenCalled();
  });

  it("downloads dubbed audio directly for completed DUBBING job", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: "/api/dubbing/job-1/audio",
      jobData: {
        kind: "DUBBING",
        dubbingId: "elevenlabs-dub-1",
        targetLanguage: "es",
      },
    } as never);

    const mockBuffer = Buffer.from("mp3-data-bytes");
    vi.mocked(getDubbedAudio).mockResolvedValue({
      audio: mockBuffer,
      contentType: "audio/mpeg",
    });

    const { req, context } = makeRequest("job-1", "?title=Spanish_Demo");
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Spanish_Demo.mp3"');
    expect(getDubbedAudio).toHaveBeenCalledWith("elevenlabs-dub-1", "es");
  });

  it("sets matching filename extension when audio content type is wav", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: "/api/dubbing/job-1/audio",
      jobData: {
        kind: "DUBBING",
        dubbingId: "elevenlabs-dub-1",
        targetLanguage: "es",
      },
    } as never);

    const mockBuffer = Buffer.from("wav-data-bytes");
    vi.mocked(getDubbedAudio).mockResolvedValue({
      audio: mockBuffer,
      contentType: "audio/wav",
    });

    const { req, context } = makeRequest("job-1", "?title=Spanish_Demo");
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Spanish_Demo.wav"');
  });

  it("returns 502 with generic message when upstream dubbing audio retrieval fails", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: "/api/dubbing/job-1/audio",
      jobData: {
        kind: "DUBBING",
        dubbingId: "elevenlabs-dub-1",
        targetLanguage: "es",
      },
    } as never);

    vi.mocked(getDubbedAudio).mockRejectedValue(
      new Error("ElevenLabs audio retrieval failed (404): Not found")
    );

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    // Generic message — raw upstream error body must not be exposed.
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Failed to retrieve dubbed audio" });
  });

  it("returns 502 with generic message when upstream returns unexpected content type", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: "/api/dubbing/job-1/audio",
      jobData: {
        kind: "DUBBING",
        dubbingId: "elevenlabs-dub-1",
        targetLanguage: "es",
      },
    } as never);

    vi.mocked(getDubbedAudio).mockRejectedValue(
      new Error("ElevenLabs returned an unexpected content type for the dubbed audio")
    );

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Failed to retrieve dubbed audio" });
  });

  it("returns 400 when non-dubbing job has no exportedUrl", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: null,
      jobData: { kind: "RENDER" },
    } as never);

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No exported URL available",
    });
  });

  it("returns 400 when exportedUrl is unsafe", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: "http://127.0.0.1/evil.mp4",
      jobData: { kind: "RENDER" },
    } as never);

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Exported file URL is not allowed",
    });
  });

  it("proxies exported video URL for safe URLs", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: "https://example.com/exported.mp4",
      jobData: { kind: "RENDER" },
    } as never);

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("video-bytes", {
        status: 200,
        headers: { "content-type": "video/mp4" },
      })
    );

    const { req, context } = makeRequest("job-1", "?title=Final_Video");
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Final_Video.mp4"');
  });

  it("sends a fixed video content type with nosniff instead of the upstream type", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: "https://example.com/exported.mp4",
      jobData: { kind: "RENDER" },
    } as never);

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("video-bytes", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("video-bytes");
  });

  it("fetches the upstream with a timeout signal", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: "https://example.com/exported.mp4",
      jobData: { kind: "RENDER" },
    } as never);

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("video-bytes", {
        status: 200,
        headers: { "content-type": "video/mp4" },
      })
    );

    const { req, context } = makeRequest("job-1");
    await GET(req, context);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/exported.mp4",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/exported.mp4",
      expect.objectContaining({ redirect: "manual" })
    );
  });

  it("does not follow an upstream redirect", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: "https://example.com/exported.mp4",
      jobData: { kind: "RENDER" },
    } as never);

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("redirecting", {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      })
    );

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/exported.mp4",
      expect.objectContaining({ redirect: "manual" })
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Failed to fetch exported file (302)",
    });
  });

  it("rejects an upstream that declares more than the size cap", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: "https://example.com/exported.mp4",
      jobData: { kind: "RENDER" },
    } as never);

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("video-bytes", {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": String(600 * 1024 * 1024),
        },
      })
    );

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Exported file is too large" });
  });

  it("cancels the upstream reader when the streamed body exceeds the cap", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: "https://example.com/exported.mp4",
      jobData: { kind: "RENDER" },
    } as never);

    let cancelCalled = false;
    const hugeBody = new ReadableStream<Uint8Array>({
      start(controller) {
        // 501MB with no content-length: only the streaming cap can catch this.
        // Left open on purpose: the route must cancel us.
        controller.enqueue(new Uint8Array(501 * 1024 * 1024));
      },
      cancel() {
        cancelCalled = true;
      },
    });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(hugeBody, {
        status: 200,
        headers: { "content-type": "video/mp4" },
      })
    );

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    await expect(res.arrayBuffer()).rejects.toThrow(/exceeds size limit/);
    expect(cancelCalled).toBe(true);
  });

  it("returns 502 when the upstream fetch itself fails", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      userId: "user-123",
      status: "COMPLETED",
      exportedUrl: "https://example.com/exported.mp4",
      jobData: { kind: "RENDER" },
    } as never);

    vi.spyOn(global, "fetch").mockRejectedValue(new Error("fetch failed"));

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(502);
  });
});

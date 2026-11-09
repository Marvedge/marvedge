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
  const url = `http://localhost:3000/api/dubbing/${id}/audio${search}`;
  const req = new NextRequest(url, { method: "GET" });
  const context = { params: Promise.resolve({ id }) };
  return { req, context };
}

describe("GET /api/dubbing/[id]/audio", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user-123",
        email: "test@example.com",
      },
    } as never);
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 if job does not exist", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(null);

    const { req, context } = makeRequest("job-unknown");
    const res = await GET(req, context);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Job not found" });
  });

  it("returns 403 if job belongs to another user", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-1",
      userId: "different-user",
      status: "COMPLETED",
      jobData: {
        kind: "DUBBING",
        dubbingId: "dub-123",
        targetLanguage: "es",
      },
    } as never);

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 400 if job is not completed yet", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-1",
      userId: "user-123",
      status: "PROCESSING",
      jobData: {
        kind: "DUBBING",
        dubbingId: "dub-123",
        targetLanguage: "es",
      },
    } as never);

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Dubbing job is not completed" });
  });

  it("returns 400 if job is not a DUBBING job or missing dubbing metadata", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-1",
      userId: "user-123",
      status: "COMPLETED",
      jobData: {
        kind: "SUBTITLES",
      },
    } as never);

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Job does not have valid dubbing data",
    });
  });

  it("returns 502 with generic message when upstream ElevenLabs retrieval fails", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-1",
      userId: "user-123",
      status: "COMPLETED",
      jobData: {
        kind: "DUBBING",
        dubbingId: "dub-123",
        targetLanguage: "es",
      },
    } as never);

    vi.mocked(getDubbedAudio).mockRejectedValue(
      new Error("ElevenLabs audio retrieval failed (404): Not Found")
    );

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    // Generic message — does not leak the upstream error body.
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Failed to retrieve dubbed audio" });
  });

  it("returns 502 with generic message when upstream returns unexpected content type", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-1",
      userId: "user-123",
      status: "COMPLETED",
      jobData: {
        kind: "DUBBING",
        dubbingId: "dub-123",
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

  it("returns 200 with inline audio stream on success", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-1",
      userId: "user-123",
      status: "COMPLETED",
      jobData: {
        kind: "DUBBING",
        dubbingId: "dub-123",
        targetLanguage: "es",
      },
    } as never);

    const mockBuffer = Buffer.from("audio-bytes-content");
    vi.mocked(getDubbedAudio).mockResolvedValue({
      audio: mockBuffer,
      contentType: "audio/mpeg",
    });

    const { req, context } = makeRequest("job-1");
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("content-disposition")).toBe("inline");
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.toString()).toBe("audio-bytes-content");

    expect(getDubbedAudio).toHaveBeenCalledWith("dub-123", "es");
  });

  it("returns 200 with sanitized attachment disposition when ?download=true is requested", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-1",
      userId: "user-123",
      status: "COMPLETED",
      jobData: {
        kind: "DUBBING",
        dubbingId: "dub-123",
        targetLanguage: "fr",
      },
    } as never);

    const mockBuffer = Buffer.from("audio-bytes-content");
    vi.mocked(getDubbedAudio).mockResolvedValue({
      audio: mockBuffer,
      contentType: "audio/mpeg",
    });

    const { req, context } = makeRequest("job-1", "?download=true");
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="dubbed_job-1_fr.mp3"'
    );
  });

  it("sets matching filename extension when audio content type is wav", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-1",
      userId: "user-123",
      status: "COMPLETED",
      jobData: {
        kind: "DUBBING",
        dubbingId: "dub-123",
        targetLanguage: "es",
      },
    } as never);

    const mockBuffer = Buffer.from("wav-audio-content");
    vi.mocked(getDubbedAudio).mockResolvedValue({
      audio: mockBuffer,
      contentType: "audio/wav",
    });

    const { req, context } = makeRequest("job-1", "?download=true");
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="dubbed_job-1_es.wav"'
    );
  });

  it("sanitizes dangerous characters in language code when building filename", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-safe",
      userId: "user-123",
      status: "COMPLETED",
      jobData: {
        kind: "DUBBING",
        dubbingId: "dub-123",
        // Simulate a pathological value that could reach DB without normalization
        targetLanguage: 'es"; rm -rf /',
      },
    } as never);

    const mockBuffer = Buffer.from("audio");
    vi.mocked(getDubbedAudio).mockResolvedValue({
      audio: mockBuffer,
      contentType: "audio/mpeg",
    });

    const { req, context } = makeRequest("job-safe", "?download=true");
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toBe('attachment; filename="dubbed_job-safe_es_rm_-rf_.mp3"');
  });
});

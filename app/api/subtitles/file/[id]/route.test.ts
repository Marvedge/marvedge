import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";

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
    demo: {
      findUnique: vi.fn(),
    },
    subtitleTrack: {
      findFirst: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { GET } from "./route";

function makeGetRequest(
  id: string,
  headers?: Record<string, string>
): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest(`http://localhost:3000/api/subtitles/file/${id}`, {
    method: "GET",
    headers,
  });
  return [req, { params: Promise.resolve({ id }) }];
}

describe("GET /api/subtitles/file/[id] (Task 112: Secure Caption Serving & Authorization)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("returns 400 for empty or invalid id", async () => {
    const [req, ctx] = makeGetRequest("");
    const res = await GET(req, ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid caption id");
  });

  it.each([
    "../etc/passwd",
    "..\\windows\\win.ini",
    "id with spaces",
    "id/with/slashes",
    "id?query=1",
    "a".repeat(201),
  ])("rejects path traversal / invalid id '%s' with 400", async (badId) => {
    const [req, ctx] = makeGetRequest(badId);
    const res = await GET(req, ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid caption id");
  });

  it("returns 404 when caption is not found on disk or in database", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.demo.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.subtitleTrack.findFirst).mockResolvedValue(null);

    const [req, ctx] = makeGetRequest("nonexistent-track-123");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Caption file not found");
  });

  it("returns 401 when requesting private captions without a session or worker token", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "private-job-1",
      userId: "user-owner",
      demoId: null,
      jobData: null,
      demo: null,
    } as never);

    const [req, ctx] = makeGetRequest("private-job-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 403 when authenticated user does not own private captions", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-attacker" } });
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "private-job-1",
      userId: "user-owner",
      demoId: null,
      jobData: null,
      demo: { userId: "user-owner", isPublic: false },
    } as never);

    const [req, ctx] = makeGetRequest("private-job-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
  });

  it("allows access with valid worker Bearer token (CALLBACK_SECRET)", async () => {
    process.env.CALLBACK_SECRET = "secret-token-123";
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "worker-job-1",
      userId: "user-owner",
      jobData: {
        kind: "SUBTITLES",
        language: "en",
        subtitles: [{ start: 0, end: 2, text: "Worker caption" }],
      },
      demo: null,
    } as never);

    const [req, ctx] = makeGetRequest("worker-job-1", {
      Authorization: "Bearer secret-token-123",
    });
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Worker caption");

    const cachedFile = path.resolve(process.cwd(), "public", "captions", "worker-job-1.ass");
    if (fs.existsSync(cachedFile)) fs.unlinkSync(cachedFile);
  });

  it("allows access to public demo captions without authentication", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "public-job-1",
      userId: "user-owner",
      demoId: "demo-1",
      jobData: {
        subtitles: [{ start: 1, end: 3, text: "Public subtitle" }],
      },
      demo: { userId: "user-owner", isPublic: true },
    } as never);

    const [req, ctx] = makeGetRequest("public-job-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Public subtitle");

    const cachedFile = path.resolve(process.cwd(), "public", "captions", "public-job-1.ass");
    if (fs.existsSync(cachedFile)) fs.unlinkSync(cachedFile);
  });

  it("serves pre-generated disk file from public/captions for authorized owner", async () => {
    const testId = `test-track-${Date.now()}`;
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-owner" } });
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: testId,
      userId: "user-owner",
      demoId: null,
      jobData: null,
      demo: null,
    } as never);

    const captionsDir = path.resolve(process.cwd(), "public", "captions");
    if (!fs.existsSync(captionsDir)) {
      fs.mkdirSync(captionsDir, { recursive: true });
    }
    const filePath = path.resolve(captionsDir, `${testId}.ass`);
    const sampleAss = `[Script Info]\nScriptType: v4.00+\n[Events]\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello world\n`;
    fs.writeFileSync(filePath, sampleAss, "utf8");

    try {
      const [req, ctx] = makeGetRequest(testId);
      const res = await GET(req, ctx);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/x-ssa");
      expect(res.headers.get("content-disposition")).toBe(`inline; filename="${testId}.ass"`);
      const body = await res.text();
      expect(body).toBe(sampleAss);
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  it("dynamically generates ASS file from VideoJob database cues when disk file is absent", async () => {
    const testId = `job-cues-${Date.now()}`;
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-owner" } });
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: testId,
      userId: "user-owner",
      jobData: {
        kind: "SUBTITLES",
        language: "en",
        subtitles: [
          { start: 1, end: 3, text: "Database generated caption" },
        ],
      },
      demo: null,
    } as never);

    const [req, ctx] = makeGetRequest(testId);
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-ssa");
    const text = await res.text();
    expect(text).toContain("[Script Info]");
    expect(text).toContain("Database generated caption");

    const cachedFile = path.resolve(process.cwd(), "public", "captions", `${testId}.ass`);
    if (fs.existsSync(cachedFile)) {
      fs.unlinkSync(cachedFile);
    }
  });

  it("dynamically generates ASS file from SubtitleTrack database cues when VideoJob is absent", async () => {
    const testId = `track-cues-${Date.now()}`;
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-owner" } });
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.demo.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.subtitleTrack.findFirst).mockResolvedValue({
      id: testId,
      language: "en",
      cues: [
        { start: 0.5, end: 2.5, text: "Track cue test" },
      ],
      demo: { userId: "user-owner", isPublic: false },
    } as never);

    const [req, ctx] = makeGetRequest(testId);
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-ssa");
    const text = await res.text();
    expect(text).toContain("Track cue test");

    const cachedFile = path.resolve(process.cwd(), "public", "captions", `${testId}.ass`);
    if (fs.existsSync(cachedFile)) {
      fs.unlinkSync(cachedFile);
    }
  });
});

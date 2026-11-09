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
    user: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/avs/flags", () => ({
  isAvsEnabled: vi.fn(() => true),
}));

vi.mock("@/app/lib/avs/access", () => ({
  isAvsAllowed: vi.fn(() => true),
}));

vi.mock("@/app/lib/gcpWorker", () => ({
  invokeGcpVoiceover: vi.fn(),
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { invokeGcpVoiceover } from "@/app/lib/gcpWorker";
import { POST } from "./route";

function makeLines(count: number, text = "Hello world") {
  return Array.from({ length: count }, (_, i) => ({ stepId: `step-${i}`, text }));
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/avs/voiceover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/avs/voiceover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "pro@example.com" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user-1",
      plan: "PRO",
    } as never);
    vi.mocked(isRateLimited).mockResolvedValue(false);
    vi.mocked(invokeGcpVoiceover).mockResolvedValue({
      audioUrl: "https://example.com/voiceover.mp3",
      duration: 12.5,
      stepTimings: [],
    } as never);
  });

  it("synthesizes a valid request", async () => {
    const res = await POST(makeRequest({ lines: makeLines(2) }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.audioUrl).toBe("https://example.com/voiceover.mp3");
    expect(invokeGcpVoiceover).toHaveBeenCalledOnce();
  });

  it("returns 429 when the user is rate limited", async () => {
    vi.mocked(isRateLimited).mockResolvedValue(true);

    const res = await POST(makeRequest({ lines: makeLines(2) }));

    expect(res.status).toBe(429);
    expect(isRateLimited).toHaveBeenCalledWith("avs-voiceover:user-1", 20, 15 * 60);
    expect(invokeGcpVoiceover).not.toHaveBeenCalled();
  });

  it("returns 413 when there are too many lines", async () => {
    const res = await POST(makeRequest({ lines: makeLines(201) }));

    expect(res.status).toBe(413);
    expect(invokeGcpVoiceover).not.toHaveBeenCalled();
  });

  it("returns 413 when the total text exceeds the character cap", async () => {
    const lines = makeLines(2, "x".repeat(30_000));

    const res = await POST(makeRequest({ lines }));

    expect(res.status).toBe(413);
    expect(invokeGcpVoiceover).not.toHaveBeenCalled();
  });
});

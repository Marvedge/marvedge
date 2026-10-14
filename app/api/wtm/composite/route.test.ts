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

vi.mock("@/app/lib/gcpWorker", () => ({
  invokeGcpComposite: vi.fn(),
}));

vi.mock("@/app/lib/wtm/flags", () => ({
  isWtmEnabled: vi.fn(() => true),
}));

vi.mock("@/app/lib/wtm/access", () => ({
  isWtmAllowed: vi.fn(() => true),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { invokeGcpComposite } from "@/app/lib/gcpWorker";
import { POST } from "./route";

const WORKER_HOST = "video-worker-abc123-uc.a.run.app";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/wtm/composite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/wtm/composite 500 sanitization (#446)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "pro@example.com" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user-1",
      plan: "PRO",
    } as never);
  });

  it("returns a generic body without the worker hostname on a worker 503", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const workerError = new Error(
        `GCP worker failed (503) at https://${WORKER_HOST}/wtm-composite`
      );
      vi.mocked(invokeGcpComposite).mockRejectedValue(workerError);

      const res = await POST(
        makeRequest({
          videoUrl: "https://example.com/source.mp4",
          webcam: {
            enabled: true,
            sourceUrl: "https://example.com/webcam.mp4",
            position: "bl",
            size: 0.28,
          },
        })
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({ error: "Compositing failed" });
      expect(JSON.stringify(body)).not.toContain(WORKER_HOST);
      expect(JSON.stringify(body)).not.toContain("run.app");
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

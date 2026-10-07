import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
      findUnique: vi.fn(),
    },
    tutorial: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/app/lib/cloudinary", () => ({
  default: {
    uploader: {
      upload_stream: vi.fn(
        (
          _options: unknown,
          callback: (error: Error | null, result?: { secure_url: string }) => void
        ) => ({
          end: vi.fn(() => {
            callback(null, {
              secure_url: "https://res.cloudinary.com/test/image/upload/tutorial-slide.png",
            });
          }),
        })
      ),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import cloudinary from "@/app/lib/cloudinary";
import { GET, POST } from "./route";

// 1x1 PNG: valid magic bytes, tiny decoded size.
const VALID_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function makeSlide(overrides: Record<string, unknown> = {}) {
  return {
    title: "Slide 1",
    description: "Test slide",
    imageData: VALID_PNG_DATA_URL,
    clicks: [],
    timestamp: 0,
    ...overrides,
  };
}

function makeTutorialRequest(slides: unknown[] = [makeSlide()]): NextRequest {
  return new NextRequest("http://localhost:3000/api/tutorials", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: "QA tutorial",
      description: "Regression test",
      slides,
    }),
  });
}

describe("/api/tutorials internal error privacy (Bug 0032)", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user-1",
        email: "qa@example.com",
        name: "QA Tester",
        image: null,
      },
    } as never);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
    } as never);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("POST returns a generic error without exposing Prisma details", async () => {
    const internalError = new Error(
      "Invalid prisma.tutorial.create() invocation: database query execution failed"
    );

    vi.mocked(prisma.tutorial.create).mockRejectedValue(internalError);

    const response = await POST(makeTutorialRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Failed to save tutorial",
    });

    expect(JSON.stringify(body)).not.toContain("prisma");
    expect(JSON.stringify(body)).not.toContain("database");
    expect(JSON.stringify(body)).not.toContain("query");

    expect(consoleErrorSpy).toHaveBeenCalledWith("Tutorial save error:", internalError);
  });

  it("GET returns a generic error without exposing Prisma details", async () => {
    const internalError = new Error(
      "Invalid prisma.tutorial.findMany() invocation: database connection failed"
    );

    vi.mocked(prisma.tutorial.findMany).mockRejectedValue(internalError);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Failed to fetch tutorials",
    });

    expect(JSON.stringify(body)).not.toContain("prisma");
    expect(JSON.stringify(body)).not.toContain("database");
    expect(JSON.stringify(body)).not.toContain("connection");

    expect(consoleErrorSpy).toHaveBeenCalledWith("Tutorial fetch error:", internalError);
  });
});

describe("/api/tutorials upload caps (#445)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user-1",
        email: "qa@example.com",
        name: "QA Tester",
        image: null,
      },
    } as never);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
    } as never);
  });

  it("rejects more than 30 slides without uploading", async () => {
    const slides = Array.from({ length: 31 }, (_, i) =>
      makeSlide({ title: `Slide ${i + 1}` })
    );
    const response = await POST(makeTutorialRequest(slides));
    expect(response.status).toBe(413);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });

  it("rejects a slide whose decoded bytes exceed 5MB", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    // Keep PNG magic so the size check (not the type check) fires.
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47;
    const imageData = `data:image/png;base64,${big.toString("base64")}`;
    const response = await POST(makeTutorialRequest([makeSlide({ imageData })]));
    expect(response.status).toBe(413);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });

  it("rejects non-image bytes by magic bytes", async () => {
    const imageData = "data:image/png;base64,aGVsbG8="; // "hello", no image magic
    const response = await POST(makeTutorialRequest([makeSlide({ imageData })]));
    expect(response.status).toBe(400);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });

  it("rejects the reported 100-slide payload without uploading or creating", async () => {
    const slides = Array.from({ length: 100 }, (_, i) => makeSlide({ title: `Slide ${i + 1}` }));
    const response = await POST(makeTutorialRequest(slides));
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toContain("Too many slides");
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
    expect(prisma.tutorial.create).not.toHaveBeenCalled();
  });

  it("rejects an oversized base64 payload on the raw string before decoding", async () => {
    const imageData = `data:image/png;base64,${"A".repeat(7 * 1024 * 1024 + 1)}`;
    const response = await POST(makeTutorialRequest([makeSlide({ imageData })]));
    expect(response.status).toBe(413);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
    expect(prisma.tutorial.create).not.toHaveBeenCalled();
  });

  it("returns 429 when the user exceeds 10 saves per minute", async () => {
    vi.mocked(isRateLimited).mockResolvedValueOnce(true);
    const response = await POST(makeTutorialRequest());
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toContain("Too many requests");
    expect(isRateLimited).toHaveBeenCalledWith(
      expect.stringContaining("tutorials:"),
      10,
      60
    );
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
    expect(prisma.tutorial.create).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

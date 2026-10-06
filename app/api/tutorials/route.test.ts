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
import { GET, POST } from "./route";

function makeTutorialRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/tutorials", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: "QA tutorial",
      description: "Regression test",
      slides: [
        {
          title: "Slide 1",
          description: "Test slide",
          imageData: "data:image/png;base64,aGVsbG8=",
          clicks: [],
          timestamp: 0,
        },
      ],
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

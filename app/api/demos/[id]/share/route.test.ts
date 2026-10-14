import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  demoFindFirst: vi.fn(),
  demoUpdate: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    demo: {
      findFirst: mocks.demoFindFirst,
      update: mocks.demoUpdate,
    },
  },
}));

import * as shareRoute from "./route";

function makeRequest(method: "PUT" | "POST") {
  return new NextRequest("http://localhost:3000/api/demos/demo-1/share", { method });
}

function routeContext() {
  return {
    params: Promise.resolve({ id: "demo-1" }),
  };
}

describe("demo share publishing security", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getServerSession.mockResolvedValue({
      user: {
        id: "user-1",
      },
    });

    mocks.demoFindFirst.mockResolvedValue({
      id: "demo-1",
      publicLink: null,
      isPublic: false,
    });

    mocks.demoUpdate.mockResolvedValue({
      id: "demo-1",
      publicLink: "demo-1",
      shareCount: 0,
    });
  });

  it("does not expose a GET handler that can publish a demo", () => {
    expect("GET" in shareRoute).toBe(false);
  });

  it("publishes an owned demo through PUT without incrementing shareCount", async () => {
    const response = await shareRoute.PUT(makeRequest("PUT"), routeContext());

    if (!response) {
      throw new Error("PUT did not return a response");
    }

    if (!response) {
      throw new Error("PUT did not return a response");
    }

    if (!response) {
      throw new Error("PUT did not return a response");
    }

    expect(response.status).toBe(200);

    expect(mocks.demoFindFirst).toHaveBeenCalledWith({
      where: {
        id: "demo-1",
        userId: "user-1",
      },
      select: {
        id: true,
        publicLink: true,
        isPublic: true,
      },
    });

    expect(mocks.demoUpdate).toHaveBeenCalledWith({
      where: {
        id: "demo-1",
      },
      data: {
        isPublic: true,
        publicLink: "demo-1",
      },
      select: {
        id: true,
        publicLink: true,
        shareCount: true,
      },
    });
  });

  it("rejects unauthenticated PUT requests before updating the demo", async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);

    const response = await shareRoute.PUT(makeRequest("PUT"), routeContext());

    if (!response) {
      throw new Error("PUT did not return a response");
    }

    if (!response) {
      throw new Error("PUT did not return a response");
    }

    if (!response) {
      throw new Error("PUT did not return a response");
    }

    expect(response.status).toBe(401);
    expect(mocks.demoFindFirst).not.toHaveBeenCalled();
    expect(mocks.demoUpdate).not.toHaveBeenCalled();
  });

  it("preserves POST share-count behaviour for owned demos", async () => {
    await shareRoute.POST(makeRequest("POST"), routeContext());

    expect(mocks.demoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          isPublic: true,
          publicLink: "demo-1",
          shareCount: {
            increment: 1,
          },
        },
      })
    );
  });
});

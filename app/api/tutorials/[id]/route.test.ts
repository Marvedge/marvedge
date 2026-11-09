import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  tutorialFindUnique: vi.fn(),
  tutorialDelete: vi.fn(),
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
    tutorial: {
      findUnique: mocks.tutorialFindUnique,
      delete: mocks.tutorialDelete,
    },
  },
}));

import { DELETE, GET } from "./route";

const context = {
  params: Promise.resolve({
    id: "tutorial-1",
  }),
};

describe("/api/tutorials/[id] internal error privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getServerSession.mockResolvedValue({
      user: {
        email: "owner@example.test",
      },
    });

    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
    });

    mocks.tutorialFindUnique.mockResolvedValue({
      id: "tutorial-1",
      userId: "user-1",
      slides: [],
    });

    mocks.tutorialDelete.mockResolvedValue({
      id: "tutorial-1",
    });
  });

  it("does not expose database details from GET failures", async () => {
    const sensitiveMessage = "Prisma P2022: column Tutorial.privateField does not exist";

    mocks.tutorialFindUnique.mockRejectedValueOnce(new Error(sensitiveMessage));

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await GET(
        new NextRequest("http://localhost:3000/api/tutorials/tutorial-1"),
        context
      );

      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual({
        error: "Failed to fetch tutorial",
      });
      expect(JSON.stringify(body)).not.toContain(sensitiveMessage);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("does not expose database details from DELETE failures", async () => {
    const sensitiveMessage = "Prisma P2003: foreign key constraint Slide_tutorialId_fkey";

    mocks.tutorialDelete.mockRejectedValueOnce(new Error(sensitiveMessage));

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await DELETE(
        new NextRequest("http://localhost:3000/api/tutorials/tutorial-1", {
          method: "DELETE",
        }),
        context
      );

      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual({
        error: "Failed to delete tutorial",
      });
      expect(JSON.stringify(body)).not.toContain(sensitiveMessage);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

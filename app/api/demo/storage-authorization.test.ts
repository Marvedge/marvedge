import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUser: vi.fn(),
  findDemo: vi.fn(),
  createDemo: vi.fn(),
  updateDemo: vi.fn(),
  findJob: vi.fn(),
  findExport: vi.fn(),
  objectExists: vi.fn(),
  signDownload: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.session,
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    demo: {
      findFirst: mocks.findDemo,
      create: mocks.createDemo,
      updateMany: mocks.updateDemo,
    },
    videoJob: { findFirst: mocks.findJob },
    exportedVideo: { findFirst: mocks.findExport },
  },
}));

vi.mock("@/app/lib/storage", () => ({
  parseStorageUri: (uri: string) => {
    const match = uri.match(/^(?:s3|gs):\/\/([^/]+)\/(.+)$/);
    return match ? { bucket: match[1], key: match[2] } : null;
  },
  objectExists: mocks.objectExists,
  getSignedDownloadUrl: mocks.signDownload,
}));

import { POST, PATCH } from "./route";
import { GET as resolveStorage } from "../gcs/resolve/route";

const foreignUri = "gs://qa-private-bucket/uploads/video/user-2/private.mp4";
let storedDemo: Record<string, unknown> | null;

function matchesFields(row: Record<string, unknown>, filter: Record<string, unknown>) {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

describe("private storage authorization through demo references", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("RAW_BUCKET", "qa-private-bucket");
    storedDemo = null;

    mocks.session.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.test" },
    });
    mocks.findUser.mockResolvedValue({ id: "user-1" });
    mocks.findJob.mockResolvedValue(null);
    mocks.findExport.mockResolvedValue(null);
    mocks.objectExists.mockResolvedValue(true);
    mocks.signDownload.mockResolvedValue("https://storage.example.test/private.mp4?signature=mock");

    mocks.findDemo.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (!storedDemo || storedDemo.userId !== where.userId) {
        return null;
      }

      if (Array.isArray(where.OR)) {
        const row = storedDemo;
        return where.OR.some((filter: Record<string, unknown>) => matchesFields(row, filter))
          ? { ...storedDemo }
          : null;
      }

      return matchesFields(storedDemo, where) ? { ...storedDemo } : null;
    });

    mocks.createDemo.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      storedDemo = { id: "demo-1", ...data };
      return { ...storedDemo };
    });

    mocks.updateDemo.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (!storedDemo || !matchesFields(storedDemo, where)) {
          return { count: 0 };
        }

        Object.assign(storedDemo, data);
        return { count: 1 };
      }
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["POST", "PATCH"])(
    "does not authorize another user's upload after a demo %s",
    async (method) => {
      if (method === "PATCH") {
        storedDemo = {
          id: "demo-1",
          userId: "user-1",
          title: "Own demo",
          videoUrl: "https://example.com/own.mp4",
        };
      }

      const body =
        method === "POST"
          ? { title: "Imported demo", videoUrl: foreignUri }
          : { id: "demo-1", exportedUrl: foreignUri };

      const request = new NextRequest("http://localhost/api/demo", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const writeResponse = method === "POST" ? await POST(request) : await PATCH(request);

      // A safe implementation may reject the reference at write time.
      expect([200, 400, 403]).toContain(writeResponse.status);

      const resolveResponse = await resolveStorage(
        new NextRequest(`http://localhost/api/gcs/resolve?url=${encodeURIComponent(foreignUri)}`)
      );

      expect(resolveResponse.status).toBe(404);
      expect(mocks.signDownload).not.toHaveBeenCalled();
    }
  );
});

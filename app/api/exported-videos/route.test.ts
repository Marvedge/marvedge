import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn(),
  };
});

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    demo: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    videoJob: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    exportedVideo: {
      count: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/app/lib/cloudinary", () => ({
  default: {
    uploader: {
      destroy: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/cloudinary-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/cloudinary-utils")>();
  return {
    ...actual,
    deleteCloudinaryVideoByUrl: vi.fn(async () => undefined),
  };
});

vi.mock("@/app/lib/hls/package", () => ({
  packageDemoHls: vi.fn(async () => undefined),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { deleteCloudinaryVideoByUrl } from "@/app/lib/cloudinary-utils";
import { DELETE, POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/exported-videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/exported-videos?id=${id}`, {
    method: "DELETE",
  });
}

describe("POST /api/exported-videos paywall race (#444)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "free@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ plan: "FREE" } as never);
    vi.mocked(prisma.demo.findUnique).mockResolvedValue({
      id: "demo-1",
      userId: "user-1",
    } as never);
  });

  it("locks the user row then counts then creates inside one transaction", async () => {
    const order: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => {
        order.push("lock");
        return [];
      }),
      videoJob: {
        count: vi.fn(async () => {
          order.push("count-job");
          return 0;
        }),
      },
      exportedVideo: {
        count: vi.fn(async () => {
          order.push("count-saved");
          return 0;
        }),
        create: vi.fn(async () => {
          order.push("create");
          return { id: "export-1" };
        }),
      },
    };
    const mockedTx = prisma.$transaction as unknown as {
      mockImplementation: (fn: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>) => void;
    };
    mockedTx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      order.push("transaction");
      return fn(tx);
    });

    const res = await POST(
      makeRequest({
        exportedUrl: "https://example.com/export.mp4",
        title: "Export",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const rawCall = (tx.$queryRaw as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const rawStrings = rawCall[0] as unknown as { raw?: string[] };
    const rawQuery =
      typeof rawStrings === "object" && rawStrings !== null && "raw" in rawStrings
        ? (rawStrings.raw as string[]).join("")
        : String(rawStrings);
    expect(rawQuery).toContain("FOR UPDATE");

    expect(order).toEqual(["transaction", "lock", "count-job", "count-saved", "create"]);
    expect(vi.mocked(prisma.videoJob.count)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.exportedVideo.count)).not.toHaveBeenCalled();
  });

  it("returns 403 without creating when the trial limit is reached", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => []),
      videoJob: { count: vi.fn(async () => 3) },
      exportedVideo: {
        count: vi.fn(async () => 3),
        create: vi.fn(async () => ({ id: "nope" })),
        upsert: vi.fn(async () => ({ id: "nope" })),
        findUnique: vi.fn(async () => null),
      },
      demo: { update: vi.fn(async () => ({})) },
    };
    const mockedTx = prisma.$transaction as unknown as {
      mockImplementation: (fn: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>) => void;
    };
    mockedTx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(tx);
    });

    const res = await POST(
      makeRequest({
        exportedUrl: "https://example.com/export.mp4",
        title: "Export",
      })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Free trial limit");
    expect(tx.exportedVideo.create).not.toHaveBeenCalled();
    expect(tx.exportedVideo.upsert).not.toHaveBeenCalled();
  });
});

describe("Cloudinary asset ownership", () => {
  const CLOUDINARY_URL =
    "https://res.cloudinary.com/test-cloud/video/upload/v1712345678/exports/recording.mp4";

  function mockCreateTransaction() {
    const create = vi.fn(async () => ({ id: "export-1" }));
    const tx = {
      $queryRaw: vi.fn(async () => []),
      videoJob: { count: vi.fn(async () => 0) },
      exportedVideo: {
        count: vi.fn(async () => 0),
        create,
      },
    };
    const mockedTx = prisma.$transaction as unknown as {
      mockImplementation: (fn: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>) => void;
    };
    mockedTx.mockImplementation(async (fn) => fn(tx));
    return { create };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test-cloud");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "pro@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ plan: "PRO" } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a managed Cloudinary URL with no owned video job on POST", async () => {
    vi.mocked(prisma.videoJob.findFirst).mockResolvedValue(null);

    const res = await POST(makeRequest({ exportedUrl: CLOUDINARY_URL }));

    expect(res.status).toBe(400);
    expect(prisma.videoJob.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", exportedUrl: CLOUDINARY_URL },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("accepts a managed Cloudinary URL with an owned video job", async () => {
    vi.mocked(prisma.videoJob.findFirst).mockResolvedValue({ id: "job-1" } as never);
    const { create } = mockCreateTransaction();

    const res = await POST(makeRequest({ exportedUrl: CLOUDINARY_URL }));

    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ exportedUrl: CLOUDINARY_URL }),
    });
  });

  it("skips the Cloudinary destroy on DELETE when no owned video job exists", async () => {
    vi.mocked(prisma.exportedVideo.findUnique).mockResolvedValue({
      id: "export-1",
      userId: "user-1",
      exportedUrl: CLOUDINARY_URL,
      demoId: null,
    } as never);
    vi.mocked(prisma.exportedVideo.delete).mockResolvedValue({} as never);
    vi.mocked(prisma.videoJob.findFirst).mockResolvedValue(null);

    const res = await DELETE(makeDeleteRequest("export-1"));

    expect(res.status).toBe(200);
    expect(prisma.exportedVideo.delete).toHaveBeenCalledWith({ where: { id: "export-1" } });
    expect(deleteCloudinaryVideoByUrl).not.toHaveBeenCalled();
  });

  it("destroys the Cloudinary asset on DELETE when the caller owns the video job", async () => {
    vi.mocked(prisma.exportedVideo.findUnique).mockResolvedValue({
      id: "export-1",
      userId: "user-1",
      exportedUrl: CLOUDINARY_URL,
      demoId: null,
    } as never);
    vi.mocked(prisma.exportedVideo.delete).mockResolvedValue({} as never);
    vi.mocked(prisma.videoJob.findFirst).mockResolvedValue({ id: "job-1" } as never);

    const res = await DELETE(makeDeleteRequest("export-1"));

    expect(res.status).toBe(200);
    expect(deleteCloudinaryVideoByUrl).toHaveBeenCalledWith(CLOUDINARY_URL);
  });

  it("accepts a non-Cloudinary URL and skips the Cloudinary destroy on DELETE", async () => {
    const { create } = mockCreateTransaction();
    const externalUrl = "https://example.com/exports/recording.mp4";

    const postRes = await POST(makeRequest({ exportedUrl: externalUrl }));

    expect(postRes.status).toBe(200);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ exportedUrl: externalUrl }),
    });
    expect(prisma.videoJob.findFirst).not.toHaveBeenCalled();

    vi.mocked(prisma.exportedVideo.findUnique).mockResolvedValue({
      id: "export-2",
      userId: "user-1",
      exportedUrl: externalUrl,
      demoId: null,
    } as never);
    vi.mocked(prisma.exportedVideo.delete).mockResolvedValue({} as never);

    const deleteRes = await DELETE(makeDeleteRequest("export-2"));

    expect(deleteRes.status).toBe(200);
    expect(prisma.exportedVideo.delete).toHaveBeenCalledWith({ where: { id: "export-2" } });
    expect(deleteCloudinaryVideoByUrl).not.toHaveBeenCalled();
  });
});

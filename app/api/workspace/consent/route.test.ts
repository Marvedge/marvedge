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
    workspaceConsent: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { GET, POST } from "./route";

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/workspace/consent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/workspace/consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 404 when authenticated user is not found in database", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "non-existent-user", email: "test@marvedge.test" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("User not found");
  });

  it("returns default-off consent (false/null) when user has no consent record", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "user1@marvedge.test" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user-1",
      workspaceConsent: null,
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.voiceCloningConsent).toBe(false);
    expect(data.faceTrackingConsent).toBe(false);
    expect(data.voiceCloningConsentAt).toBeNull();
    expect(data.faceTrackingConsentAt).toBeNull();
    expect(data.updatedAt).toBeNull();
    expect(data.consent.voiceCloningConsent).toBe(false);
    expect(data.consent.faceTrackingConsent).toBe(false);
  });

  it("returns persisted consent when record exists", async () => {
    const vcDate = new Date("2026-11-16T10:00:00Z");
    const ftDate = new Date("2026-11-16T11:00:00Z");

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "user1@marvedge.test" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user-1",
      workspaceConsent: {
        voiceCloningConsent: true,
        faceTrackingConsent: false,
        voiceCloningConsentAt: vcDate,
        faceTrackingConsentAt: ftDate,
        updatedAt: ftDate,
      },
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.voiceCloningConsent).toBe(true);
    expect(data.faceTrackingConsent).toBe(false);
    expect(new Date(data.voiceCloningConsentAt).toISOString()).toBe(vcDate.toISOString());
    expect(new Date(data.faceTrackingConsentAt).toISOString()).toBe(ftDate.toISOString());
  });

  it("enforces cross-user isolation: scopes retrieval strictly to authenticated user", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-target", email: "target@marvedge.test" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user-target",
      workspaceConsent: null,
    } as never);

    await GET();

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: "user-target" }, { email: "target@marvedge.test" }],
      },
      select: expect.objectContaining({
        id: true,
        workspaceConsent: expect.any(Object),
      }),
    });
  });
});

describe("POST /api/workspace/consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await POST(makePostRequest({ voiceCloningConsent: true }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when user is not found", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await POST(makePostRequest({ voiceCloningConsent: true }));
    expect(res.status).toBe(404);
  });

  it("returns 400 on malformed or non-object body", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as never);

    const reqNull = new NextRequest("http://localhost:3000/api/workspace/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(null),
    });
    expect((await POST(reqNull)).status).toBe(400);

    const reqArray = new NextRequest("http://localhost:3000/api/workspace/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });
    expect((await POST(reqArray)).status).toBe(400);
  });

  it("returns 400 when no recognized consent field is provided", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as never);

    const res = await POST(makePostRequest({ unknownField: true }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("At least one consent field must be provided");
  });

  it("returns 400 when voiceCloningConsent is not a boolean", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as never);

    const res = await POST(makePostRequest({ voiceCloningConsent: "yes" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("voiceCloningConsent must be a boolean");
  });

  it("returns 400 when faceTrackingConsent is not a boolean", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as never);

    const res = await POST(makePostRequest({ faceTrackingConsent: 1 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("faceTrackingConsent must be a boolean");
  });

  it("grants voice cloning consent and sets timestamp", async () => {
    const fixedNow = new Date("2026-11-16T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as never);

    vi.mocked(prisma.workspaceConsent.upsert).mockResolvedValue({
      id: "wc-1",
      userId: "user-1",
      voiceCloningConsent: true,
      faceTrackingConsent: false,
      voiceCloningConsentAt: fixedNow,
      faceTrackingConsentAt: null,
      createdAt: fixedNow,
      updatedAt: fixedNow,
    } as never);

    const res = await POST(makePostRequest({ voiceCloningConsent: true }));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.voiceCloningConsent).toBe(true);
    expect(data.faceTrackingConsent).toBe(false);
    expect(new Date(data.voiceCloningConsentAt).toISOString()).toBe(fixedNow.toISOString());

    expect(prisma.workspaceConsent.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        voiceCloningConsent: true,
        voiceCloningConsentAt: fixedNow,
        faceTrackingConsent: false,
        faceTrackingConsentAt: null,
      },
      update: {
        voiceCloningConsent: true,
        voiceCloningConsentAt: fixedNow,
      },
    });

    vi.useRealTimers();
  });

  it("revokes voice cloning consent and records revocation timestamp", async () => {
    const revokeDate = new Date("2026-11-16T14:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(revokeDate);

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as never);

    vi.mocked(prisma.workspaceConsent.upsert).mockResolvedValue({
      id: "wc-1",
      userId: "user-1",
      voiceCloningConsent: false,
      faceTrackingConsent: true,
      voiceCloningConsentAt: revokeDate,
      faceTrackingConsentAt: new Date("2026-11-16T10:00:00Z"),
      createdAt: new Date("2026-11-16T10:00:00Z"),
      updatedAt: revokeDate,
    } as never);

    const res = await POST(makePostRequest({ voiceCloningConsent: false }));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.voiceCloningConsent).toBe(false);
    expect(data.faceTrackingConsent).toBe(true);
    expect(new Date(data.voiceCloningConsentAt).toISOString()).toBe(revokeDate.toISOString());

    expect(prisma.workspaceConsent.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        voiceCloningConsent: false,
        voiceCloningConsentAt: revokeDate,
        faceTrackingConsent: false,
        faceTrackingConsentAt: null,
      },
      update: {
        voiceCloningConsent: false,
        voiceCloningConsentAt: revokeDate,
      },
    });

    vi.useRealTimers();
  });

  it("preserves face tracking setting when only voice cloning is updated", async () => {
    const updateTime = new Date("2026-11-16T15:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(updateTime);

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as never);

    vi.mocked(prisma.workspaceConsent.upsert).mockResolvedValue({
      id: "wc-1",
      userId: "user-1",
      voiceCloningConsent: true,
      faceTrackingConsent: true, // preserved from previous DB state
      voiceCloningConsentAt: updateTime,
      faceTrackingConsentAt: new Date("2026-11-16T09:00:00Z"),
      createdAt: new Date("2026-11-16T09:00:00Z"),
      updatedAt: updateTime,
    } as never);

    await POST(makePostRequest({ voiceCloningConsent: true }));

    // update object only touches voiceCloningConsent and voiceCloningConsentAt
    expect(prisma.workspaceConsent.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: expect.any(Object),
      update: {
        voiceCloningConsent: true,
        voiceCloningConsentAt: updateTime,
      },
    });

    vi.useRealTimers();
  });

  it("preserves voice cloning setting when only face tracking is updated", async () => {
    const updateTime = new Date("2026-11-16T15:30:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(updateTime);

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as never);

    vi.mocked(prisma.workspaceConsent.upsert).mockResolvedValue({
      id: "wc-1",
      userId: "user-1",
      voiceCloningConsent: true,
      faceTrackingConsent: true,
      voiceCloningConsentAt: new Date("2026-11-16T09:00:00Z"),
      faceTrackingConsentAt: updateTime,
      createdAt: new Date("2026-11-16T09:00:00Z"),
      updatedAt: updateTime,
    } as never);

    await POST(makePostRequest({ faceTrackingConsent: true }));

    expect(prisma.workspaceConsent.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: expect.any(Object),
      update: {
        faceTrackingConsent: true,
        faceTrackingConsentAt: updateTime,
      },
    });

    vi.useRealTimers();
  });
});

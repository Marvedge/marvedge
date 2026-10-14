import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

import { authOptions } from "./options";

function jwtCallback() {
  const callback = authOptions.callbacks?.jwt;

  if (!callback) {
    throw new Error("JWT callback is not configured");
  }

  return callback;
}

function sessionCallback() {
  const callback = authOptions.callbacks?.session;

  if (!callback) {
    throw new Error("Session callback is not configured");
  }

  return callback;
}

describe("JWT session revocation (BUG-0039)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores the current sessionVersion in a newly issued JWT", async () => {
    mocks.userFindUnique.mockResolvedValue({
      sessionVersion: 7,
    });

    const token = await jwtCallback()({
      token: {},
      user: {
        id: "user-1",
        email: "owner@example.test",
        name: "Owner",
        image: null,
      },
      account: null,
      profile: undefined,
      trigger: "signIn",
      isNewUser: false,
      session: undefined,
    } as never);

    expect(token).toMatchObject({
      id: "user-1",
      email: "owner@example.test",
      sessionVersion: 7,
      sessionInvalid: false,
    });
  });

  it("marks an existing JWT invalid after sessionVersion changes", async () => {
    mocks.userFindUnique.mockResolvedValue({
      sessionVersion: 8,
    });

    const token = await jwtCallback()({
      token: {
        id: "user-1",
        sub: "user-1",
        email: "owner@example.test",
        sessionVersion: 7,
      },
      user: undefined,
      account: null,
      profile: undefined,
      trigger: undefined,
      isNewUser: false,
      session: undefined,
    } as never);

    expect(token.sessionInvalid).toBe(true);
  });

  it("fails closed for JWTs issued before sessionVersion existed", async () => {
    mocks.userFindUnique.mockResolvedValue({
      sessionVersion: 0,
    });

    const token = await jwtCallback()({
      token: {
        id: "user-1",
        sub: "user-1",
        email: "owner@example.test",
      },
      user: undefined,
      account: null,
      profile: undefined,
      trigger: undefined,
      isNewUser: false,
      session: undefined,
    } as never);

    expect(token.sessionInvalid).toBe(true);
  });

  it("fails closed when session validation cannot reach the database", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.userFindUnique.mockRejectedValue(new Error("database unavailable"));

    try {
      const token = await jwtCallback()({
        token: {
          id: "user-1",
          sub: "user-1",
          sessionVersion: 7,
        },
        user: undefined,
        account: null,
        profile: undefined,
        trigger: undefined,
        isNewUser: false,
        session: undefined,
      } as never);

      expect(token.sessionInvalid).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("removes the authenticated user from an invalid session", async () => {
    const session = await sessionCallback()({
      session: {
        user: {
          id: "user-1",
          email: "owner@example.test",
          name: "Owner",
          image: null,
        },
        expires: "2099-01-01T00:00:00.000Z",
      },
      token: {
        sessionInvalid: true,
      },
      user: undefined,
      newSession: undefined,
      trigger: "update",
    } as never);

    expect(session).not.toHaveProperty("user");
  });
});

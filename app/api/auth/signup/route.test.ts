import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isRateLimited: vi.fn(),
  hash: vi.fn(),
  userFindFirst: vi.fn(),
  userCreate: vi.fn(),
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.isRateLimited,
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: mocks.hash,
  },
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: mocks.userFindFirst,
      create: mocks.userCreate,
    },
  },
}));

import { POST } from "./route";

const successMessage =
  "If this email is available, your account has been created. You can now sign in.";

function signupRequest(email = "new.user@example.test"): Request {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7",
    },
    body: JSON.stringify({
      name: "New User",
      email,
      password: "StrongPassword123!",
    }),
  });
}

describe("signup account-enumeration protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.isRateLimited.mockResolvedValue(false);
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.userFindFirst.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({
      id: "user-1",
      email: "new.user@example.test",
      name: "New User",
    });
  });

  it("returns the generic success response for an existing account", async () => {
    mocks.userFindFirst.mockResolvedValueOnce({
      id: "existing-user",
      email: "existing@example.test",
      password: "existing-hash",
    });

    const response = await POST(signupRequest("existing@example.test"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: successMessage,
    });
    expect(JSON.stringify(body)).not.toContain("already exists");
    expect(mocks.hash).toHaveBeenCalledWith("StrongPassword123!", 12);
    expect(mocks.hash.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.userFindFirst.mock.invocationCallOrder[0]
    );
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("returns the same response when a new account is created", async () => {
    const response = await POST(signupRequest("New.User@Example.Test"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: successMessage,
    });

    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: {
        name: "New User",
        email: "new.user@example.test",
        password: "hashed-password",
      },
    });
  });

  it("does not expose a concurrent unique-constraint race", async () => {
    mocks.userCreate.mockRejectedValueOnce({
      code: "P2002",
    });

    const response = await POST(signupRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: successMessage,
    });
    expect(JSON.stringify(body)).not.toContain("P2002");
  });

  it("uses separate fail-closed IP and hashed-email limits", async () => {
    mocks.isRateLimited.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const response = await POST(signupRequest("private@example.test"));

    expect(response.status).toBe(429);

    expect(mocks.isRateLimited).toHaveBeenNthCalledWith(1, "signup:ip:203.0.113.7", 20, 900, true);

    expect(mocks.isRateLimited).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^signup:email:[a-f0-9]{64}$/),
      5,
      900,
      true
    );

    expect(JSON.stringify(mocks.isRateLimited.mock.calls)).not.toContain("private@example.test");

    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });
});

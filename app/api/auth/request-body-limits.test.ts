import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isRateLimited: vi.fn(),
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.isRateLimited,
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(),
  },
  hash: vi.fn(),
  compare: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: vi.fn(),
    };
  },
}));

import { POST as signup } from "./signup/route";
import { POST as requestReset } from "./request-reset/route";
import { POST as resetPassword } from "./reset-password/route";
import { POST as verifyOtp } from "./verify-otp/route";
import { POST as verifyReset } from "./verify-reset/route";

type AuthHandler = (request: Request) => Promise<Response>;

const routes: Array<{
  name: string;
  handler: AuthHandler;
}> = [
  {
    name: "signup",
    handler: signup,
  },
  {
    name: "request-reset",
    handler: requestReset,
  },
  {
    name: "reset-password",
    handler: resetPassword,
  },
  {
    name: "verify-otp",
    handler: verifyOtp,
  },
  {
    name: "verify-reset",
    handler: verifyReset,
  },
];

function oversizedRequest(path: string): Request {
  return new Request(`http://localhost/api/auth/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(8 * 1024 + 1),
    },
    body: "{}",
  });
}

describe("public auth request-body limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const route of routes) {
    it(`rejects an oversized ${route.name} request before protected work`, async () => {
      const response = await route.handler(oversizedRequest(route.name));

      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({
        error: "Request body too large",
      });

      expect(mocks.isRateLimited).not.toHaveBeenCalled();

      expect(mocks.getServerSession).not.toHaveBeenCalled();
    });
  }
});

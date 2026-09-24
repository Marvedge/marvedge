import { describe, it, expect, afterEach } from "vitest";
import { getReframeWorkerConfig } from "./config";

describe("Reframe Worker Config", () => {
  const originalCallbackSecret = process.env.CALLBACK_SECRET;

  afterEach(() => {
    if (originalCallbackSecret === undefined) {
      delete process.env.CALLBACK_SECRET;
    } else {
      process.env.CALLBACK_SECRET = originalCallbackSecret;
    }
  });

  it("throws an error when CALLBACK_SECRET is missing", () => {
    delete process.env.CALLBACK_SECRET;

    expect(() => getReframeWorkerConfig()).toThrow(
      "CALLBACK_SECRET is required for the Reframe Worker"
    );
  });

  it("loads successfully when CALLBACK_SECRET is configured", () => {
    process.env.CALLBACK_SECRET = "test-secret";

    const config = getReframeWorkerConfig();

    expect(config.callbackSecret).toBe("test-secret");
  });
});
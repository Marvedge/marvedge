import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CallbackHttpError,
  buildCallbackUrl,
  postJobCallback,
  postJobCallbackWithRetry,
} from "./callbackClient";
import type { JobCallbackPayload } from "../../types/jobs/callback";

describe("Callback HTTP Client (Task-00026)", () => {
  const backendUrl = "http://localhost:3000";
  const callbackSecret = "test-secret-123";
  const samplePayload: JobCallbackPayload = {
    jobId: "job-test-1",
    status: "PROCESSING",
    progress: 50,
  };

  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("buildCallbackUrl", () => {
    it("formats callback endpoint URL correctly", () => {
      expect(buildCallbackUrl("http://localhost:3000")).toBe(
        "http://localhost:3000/api/jobs/callback"
      );
      expect(buildCallbackUrl("http://localhost:3000/")).toBe(
        "http://localhost:3000/api/jobs/callback"
      );
      expect(buildCallbackUrl("https://api.marvedge.com///")).toBe(
        "https://api.marvedge.com/api/jobs/callback"
      );
    });
  });

  describe("postJobCallback (Single invocation)", () => {
    it("sends successful callback with Authorization Bearer header", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      globalThis.fetch = mockFetch;

      const result = await postJobCallback(
        backendUrl,
        callbackSecret,
        samplePayload
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://localhost:3000/api/jobs/callback");
      expect(init.method).toBe("POST");
      expect(init.headers["content-type"]).toBe("application/json");
      expect(init.headers["authorization"]).toBe("Bearer test-secret-123");
      expect(JSON.parse(init.body as string)).toEqual(samplePayload);
    });

    it("handles callback without secret if empty", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      globalThis.fetch = mockFetch;

      const result = await postJobCallback(backendUrl, "", samplePayload);
      expect(result.success).toBe(true);

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers["authorization"]).toBeUndefined();
    });

    it("throws CallbackHttpError with isClientError=true on HTTP 400", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: "Invalid progress" }),
      });
      globalThis.fetch = mockFetch;

      await expect(
        postJobCallback(backendUrl, callbackSecret, samplePayload)
      ).rejects.toThrow(CallbackHttpError);

      try {
        await postJobCallback(backendUrl, callbackSecret, samplePayload);
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CallbackHttpError);
        const cbErr = err as CallbackHttpError;
        expect(cbErr.status).toBe(400);
        expect(cbErr.isClientError).toBe(true);
        expect(cbErr.message).toContain("Invalid progress");
      }
    });

    it("throws CallbackHttpError with isClientError=true on HTTP 401", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "Unauthorized" }),
      });
      globalThis.fetch = mockFetch;

      try {
        await postJobCallback(backendUrl, callbackSecret, samplePayload);
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CallbackHttpError);
        const cbErr = err as CallbackHttpError;
        expect(cbErr.status).toBe(401);
        expect(cbErr.isClientError).toBe(true);
      }
    });

    it("throws timeout error on abort", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      const mockFetch = vi.fn().mockRejectedValue(abortError);
      globalThis.fetch = mockFetch;

      await expect(
        postJobCallback(backendUrl, callbackSecret, samplePayload, {
          timeoutMs: 100,
        })
      ).rejects.toThrow("Callback request timed out after 100ms");
    });
  });

  describe("postJobCallbackWithRetry (Resilience & backoff)", () => {
    it("retries on HTTP 500 and succeeds when subsequent attempt succeeds", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: async () => ({ error: "Database unavailable" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });
      globalThis.fetch = mockFetch;

      const result = await postJobCallbackWithRetry(
        backendUrl,
        callbackSecret,
        samplePayload,
        { retries: 2, delayMs: 10 }
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries on HTTP 503 and succeeds", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          json: async () => ({ error: "Server busy" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });
      globalThis.fetch = mockFetch;

      const result = await postJobCallbackWithRetry(
        backendUrl,
        callbackSecret,
        samplePayload,
        { retries: 2, delayMs: 10 }
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries on network failure (fetch throws) and succeeds", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });
      globalThis.fetch = mockFetch;

      const result = await postJobCallbackWithRetry(
        backendUrl,
        callbackSecret,
        samplePayload,
        { retries: 2, delayMs: 10 }
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("applies exponential backoff between retries", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("Network glitch 1"))
        .mockRejectedValueOnce(new Error("Network glitch 2"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });
      globalThis.fetch = mockFetch;

      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

      const result = await postJobCallbackWithRetry(
        backendUrl,
        callbackSecret,
        samplePayload,
        { retries: 3, delayMs: 50 }
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify exponential backoff intervals: attempt 0 -> 50ms, attempt 1 -> 100ms
      const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
      expect(delays).toContain(50);
      expect(delays).toContain(100);
    });

    it("fails fast immediately without retry on HTTP 400 client error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: "Validation error: invalid cropTargets" }),
      });
      globalThis.fetch = mockFetch;

      await expect(
        postJobCallbackWithRetry(
          backendUrl,
          callbackSecret,
          samplePayload,
          { retries: 3, delayMs: 10 }
        )
      ).rejects.toThrow("Validation error: invalid cropTargets");

      // Must NOT retry 4xx errors
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("fails fast immediately without retry on HTTP 401 client error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "Unauthorized" }),
      });
      globalThis.fetch = mockFetch;

      await expect(
        postJobCallbackWithRetry(
          backendUrl,
          callbackSecret,
          samplePayload,
          { retries: 3, delayMs: 10 }
        )
      ).rejects.toThrow(CallbackHttpError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("exhausts retries and throws error on persistent 5xx failure", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({ error: "Bad Gateway" }),
      });
      globalThis.fetch = mockFetch;

      await expect(
        postJobCallbackWithRetry(
          backendUrl,
          callbackSecret,
          samplePayload,
          { retries: 2, delayMs: 10 }
        )
      ).rejects.toThrow(CallbackHttpError);

      // Initial call + 2 retries = 3 calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});

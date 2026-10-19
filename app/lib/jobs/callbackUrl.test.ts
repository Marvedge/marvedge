import { describe, expect, it } from "vitest";
import { isLoopbackHost, resolveCallbackBaseUrl } from "./callbackUrl";

describe("Callback Base URL Resolution (Task-00094)", () => {
  describe("isLoopbackHost", () => {
    it("identifies localhost variations as loopback", () => {
      expect(isLoopbackHost("http://localhost:3000")).toBe(true);
      expect(isLoopbackHost("https://localhost")).toBe(true);
      expect(isLoopbackHost("http://127.0.0.1:8080")).toBe(true);
      expect(isLoopbackHost("http://[::1]:3000")).toBe(true);
      expect(isLoopbackHost("http://0.0.0.0:3000")).toBe(true);
      expect(isLoopbackHost("http://app.localhost:3000")).toBe(true);
    });

    it("identifies non-loopback hosts correctly", () => {
      expect(isLoopbackHost("https://api.marvedge.com")).toBe(false);
      expect(isLoopbackHost("http://172.31.8.120:8080")).toBe(false);
      expect(isLoopbackHost("http://10.0.0.5:3000")).toBe(false);
      expect(isLoopbackHost("https://marvedge.internal")).toBe(false);
    });
  });

  describe("resolveCallbackBaseUrl precedence", () => {
    it("respects explicitUrl as highest priority", () => {
      const url = resolveCallbackBaseUrl({
        explicitUrl: "https://explicit.marvedge.com/",
        env: {
          INTERNAL_API_URL: "https://internal.marvedge.com",
          BACKEND_URL: "https://backend.marvedge.com",
          APP_URL: "https://app.marvedge.com",
        },
      });
      expect(url).toBe("https://explicit.marvedge.com");
    });

    it("respects INTERNAL_API_URL over BACKEND_URL and APP_URL", () => {
      const url = resolveCallbackBaseUrl({
        env: {
          INTERNAL_API_URL: "https://internal.marvedge.com/",
          BACKEND_URL: "https://backend.marvedge.com",
          APP_URL: "https://app.marvedge.com",
        },
      });
      expect(url).toBe("https://internal.marvedge.com");
    });

    it("respects BACKEND_URL over APP_URL", () => {
      const url = resolveCallbackBaseUrl({
        env: {
          BACKEND_URL: "https://backend.marvedge.com///",
          APP_URL: "https://app.marvedge.com",
          NEXTAUTH_URL: "https://nextauth.marvedge.com",
        },
      });
      expect(url).toBe("https://backend.marvedge.com");
    });

    it("respects APP_URL over NEXTAUTH_URL", () => {
      const url = resolveCallbackBaseUrl({
        env: {
          APP_URL: "https://app.marvedge.com/",
          NEXTAUTH_URL: "https://nextauth.marvedge.com",
          NEXT_PUBLIC_APP_URL: "https://public.marvedge.com",
        },
      });
      expect(url).toBe("https://app.marvedge.com");
    });

    it("respects NEXTAUTH_URL over NEXT_PUBLIC_APP_URL", () => {
      const url = resolveCallbackBaseUrl({
        env: {
          NEXTAUTH_URL: "https://nextauth.marvedge.com/",
          NEXT_PUBLIC_APP_URL: "https://public.marvedge.com",
        },
      });
      expect(url).toBe("https://nextauth.marvedge.com");
    });

    it("falls back to NEXT_PUBLIC_APP_URL when other variables are unset", () => {
      const url = resolveCallbackBaseUrl({
        env: {
          NEXT_PUBLIC_APP_URL: "https://public.marvedge.com/",
        },
      });
      expect(url).toBe("https://public.marvedge.com");
    });

    it("falls back to http://localhost:3000 in non-production environments", () => {
      const url = resolveCallbackBaseUrl({
        env: {
          NODE_ENV: "development",
        },
      });
      expect(url).toBe("http://localhost:3000");
    });
  });

  describe("Production safety & loopback prevention", () => {
    it("throws in production when no callback URL is configured", () => {
      expect(() =>
        resolveCallbackBaseUrl({
          env: {
            NODE_ENV: "production",
          },
        })
      ).toThrowError(/Callback base URL is not configured/);
    });

    it("throws in production when resolved URL is localhost", () => {
      expect(() =>
        resolveCallbackBaseUrl({
          env: {
            NODE_ENV: "production",
            BACKEND_URL: "http://localhost:3000",
          },
        })
      ).toThrowError(/Accidental localhost callback target detected in production/);
    });

    it("throws in production when resolved URL is 127.0.0.1", () => {
      expect(() =>
        resolveCallbackBaseUrl({
          env: {
            NODE_ENV: "production",
            APP_URL: "http://127.0.0.1:3000",
          },
        })
      ).toThrowError(/Accidental localhost callback target detected in production/);
    });

    it("allows localhost in production when allowLocalhostInProduction option is true", () => {
      const url = resolveCallbackBaseUrl({
        allowLocalhostInProduction: true,
        env: {
          NODE_ENV: "production",
          BACKEND_URL: "http://localhost:3000",
        },
      });
      expect(url).toBe("http://localhost:3000");
    });

    it("accepts valid production non-loopback URLs", () => {
      const url = resolveCallbackBaseUrl({
        env: {
          NODE_ENV: "production",
          BACKEND_URL: "https://api.marvedge.com",
        },
      });
      expect(url).toBe("https://api.marvedge.com");
    });
  });
});

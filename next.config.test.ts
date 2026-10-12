import { describe, expect, it } from "vitest";

import nextConfig, { buildGlobalSecurityHeaders } from "./next.config";

function headerMap(
  headers: Array<{
    key: string;
    value: string;
  }>
): Map<string, string> {
  return new Map(headers.map((header) => [header.key, header.value]));
}

describe("global security headers", () => {
  it("adds the safe baseline headers to every route", async () => {
    if (!nextConfig.headers) {
      throw new Error("Next headers configuration is missing");
    }

    const rules = await nextConfig.headers();
    const globalRule = rules.find((rule) => rule.source === "/:path*");

    expect(globalRule).toBeDefined();

    const headers = headerMap(globalRule?.headers ?? []);

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");

    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");

    expect(headers.get("Permissions-Policy")).toBe(
      "camera=(self), microphone=(self), display-capture=(self), geolocation=()"
    );
  });

  it("adds HSTS only to production builds", () => {
    const productionHeaders = headerMap(buildGlobalSecurityHeaders("production"));

    expect(productionHeaders.get("Strict-Transport-Security")).toBe("max-age=31536000");

    const developmentHeaders = headerMap(buildGlobalSecurityHeaders("development"));

    expect(developmentHeaders.has("Strict-Transport-Security")).toBe(false);
  });

  it("does not force HSTS onto customer subdomains", () => {
    const headers = headerMap(buildGlobalSecurityHeaders("production"));

    const hsts = headers.get("Strict-Transport-Security") ?? "";

    expect(hsts).not.toContain("includeSubDomains");
    expect(hsts).not.toContain("preload");
  });
});

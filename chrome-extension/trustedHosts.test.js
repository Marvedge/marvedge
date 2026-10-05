import { describe, expect, it } from "vitest";

import "./trustedHosts.js";

const isTrustedPage = globalThis.isTrustedPage;

describe("extension page gate", () => {
  it("trusts the app and local dev", () => {
    expect(isTrustedPage("marvedge.com")).toBe(true);
    expect(isTrustedPage("app.marvedge.com")).toBe(true);
    expect(isTrustedPage("localhost")).toBe(true);
    expect(isTrustedPage("127.0.0.1")).toBe(true);
  });

  it("rejects lookalike and foreign hosts", () => {
    expect(isTrustedPage("evil.com")).toBe(false);
    expect(isTrustedPage("marvedge.com.evil.com")).toBe(false);
    expect(isTrustedPage("fakemarvedge.com")).toBe(false);
    expect(isTrustedPage("notmarvedge.com")).toBe(false);
    expect(isTrustedPage("marvedge.com.evil.com")).toBe(false);
    expect(isTrustedPage("")).toBe(false);
  });
});

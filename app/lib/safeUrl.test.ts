import { describe, expect, it } from "vitest";

import { isPrivateHost, isSafeUrl } from "./safeUrl";

describe("isSafeUrl", () => {
  it("blocks the cloud metadata address", () => {
    expect(isSafeUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("blocks private ranges", () => {
    expect(isSafeUrl("http://10.0.0.5/x.mp4")).toBe(false);
    expect(isSafeUrl("http://172.16.5.4/x.mp4")).toBe(false);
    expect(isSafeUrl("http://172.31.255.1/x.mp4")).toBe(false);
    expect(isSafeUrl("http://192.168.1.1/x.mp4")).toBe(false);
    expect(isSafeUrl("http://127.0.0.1/x.mp4")).toBe(false);
    expect(isSafeUrl("http://0.0.0.0/x.mp4")).toBe(false);
    expect(isSafeUrl("http://localhost/x.mp4")).toBe(false);
  });

  it("blocks obfuscated numeric forms", () => {
    expect(isSafeUrl("http://0x7f.0.0.1/x.mp4")).toBe(false);
    expect(isSafeUrl("http://2130706433/x.mp4")).toBe(false);
    expect(isSafeUrl("http://0177.0.0.1/x.mp4")).toBe(false);
  });

  it("blocks ipv6 internals", () => {
    expect(isSafeUrl("http://[::1]/x.mp4")).toBe(false);
    expect(isSafeUrl("http://[fc00::1]/x.mp4")).toBe(false);
    expect(isSafeUrl("http://[fe80::1]/x.mp4")).toBe(false);
  });

  it("blocks non-http schemes", () => {
    expect(isSafeUrl("ftp://example.com/x.mp4")).toBe(false);
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,hi")).toBe(false);
  });

  it("rejects empty and non-string input", () => {
    expect(isSafeUrl("")).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl("not a url")).toBe(false);
  });

  it("passes internal storage uris untouched", () => {
    expect(isSafeUrl("r2://bucket/hls/demo/master.m3u8")).toBe(true);
    expect(isSafeUrl("gs://bucket/object.mp4")).toBe(true);
  });

  it("passes normal public urls", () => {
    expect(isSafeUrl("https://res.cloudinary.com/demo/video/upload/x.mp4")).toBe(true);
    expect(isSafeUrl("https://storage.googleapis.com/bucket/x.mp4")).toBe(true);
    expect(isSafeUrl("https://example.com/x.mp4")).toBe(true);
    expect(isSafeUrl("https://8.8.8.8/x.mp4")).toBe(true);
    expect(isSafeUrl("https://172.15.0.1/x.mp4")).toBe(true);
    expect(isSafeUrl("https://172.32.0.1/x.mp4")).toBe(true);
  });
});

describe("isPrivateHost", () => {
  it("flags dotless and empty hosts", () => {
    expect(isPrivateHost("internal")).toBe(true);
    expect(isPrivateHost("")).toBe(true);
  });
});

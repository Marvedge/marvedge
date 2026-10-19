import { describe, expect, it, vi, beforeEach } from "vitest";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import {
  assertSafeDownloadUrl,
  buildDrawtextFontOption,
  downloadUrlToFile,
  escapeDrawtextFilterValue,
  resolveFontForDrawtext,
  resolveRedirectTarget,
} from "./safe-download";

vi.mock("axios", () => ({ default: vi.fn() }));

const axiosMock = vi.mocked(axios as unknown as (...args: any[]) => Promise<any>);

function publicLookup() {
  return async () => [{ address: "93.184.216.34", family: 4 }];
}

function tmpDest(name: string): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vw-dl-")), name);
}

describe("video-worker drawtext font handling", () => {
  it("renders a benign family exactly as before", () => {
    // No font files exist for Helvetica, so the escaped family name is used.
    expect(buildDrawtextFontOption("Helvetica")).toBe("font='Helvetica':");
  });

  it("returns no option for an empty family", () => {
    expect(buildDrawtextFontOption("")).toBe("");
    expect(resolveFontForDrawtext("").kind).toBe("none");
  });

  it.each([
    "Arial':enable='between(t,0,100)",
    "a'b",
    "x',fontsize=200,x='0",
  ])("neutralizes single-quote breakout payload %s", (payload) => {
    const opt = buildDrawtextFontOption(payload);
    // The only unescaped quotes must be the wrapping pair around the value.
    expect(opt.startsWith("font='")).toBe(true);
    expect(opt.endsWith("':")).toBe(true);
    const inner = opt.slice("font='".length, -"':".length);
    // Every surviving quote must be backslash-escaped.
    expect(inner.replace(/\\'/g, "")).not.toContain("'");
    expect(inner).toContain("\\'");
  });

  it.each(["a:b:c", "font\\name"])(
    "escapes colon/backslash payload %s",
    (payload) => {
      const opt = buildDrawtextFontOption(payload);
      const inner = opt.slice("font='".length, -"':".length);
      // No raw separator may survive inside the quoted value.
      expect(inner).not.toMatch(/(?<!\\):/);
      expect(escapeDrawtextFilterValue(payload)).not.toBe(payload);
    }
  );

  it("never interpolates the raw family string", () => {
    const payload = "Evil':,;[]\\\nFont";
    const opt = buildDrawtextFontOption(payload);
    expect(opt).not.toContain(payload);
  });
});

describe("video-worker safe download URLs", () => {
  beforeEach(() => {
    axiosMock.mockReset();
  });

  it.each([
    "file:///etc/passwd",
    "gopher://example.test/1",
    "ftp://example.test/video.mp4",
    "data:text/plain,hello",
  ])("refuses non-http(s) URL %s before any request", async (url) => {
    await expect(assertSafeDownloadUrl(url, publicLookup())).rejects.toThrow(
      /non-http/i
    );
  });

  it.each([
    "http://localhost/video.mp4",
    "http://127.0.0.1/video.mp4",
    "http://10.0.0.8/video.mp4",
    "http://192.168.1.10/video.mp4",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/video.mp4",
    "http://metadata.internal/video.mp4",
  ])("refuses private/internal URL %s", async (url) => {
    await expect(assertSafeDownloadUrl(url, publicLookup())).rejects.toThrow(
      /blocked host|private address/i
    );
  });

  it("refuses credentials embedded in the URL", async () => {
    await expect(
      assertSafeDownloadUrl("https://user:pass@example.test/v.mp4", publicLookup())
    ).rejects.toThrow(/credentials/i);
  });

  it("refuses a public hostname resolving to a private address", async () => {
    const privateLookup = async () => [{ address: "10.0.0.8", family: 4 }];
    await expect(
      assertSafeDownloadUrl("https://cdn.example.test/v.mp4", privateLookup)
    ).rejects.toThrow(/private address/i);
  });

  it("accepts a public URL resolving publicly", async () => {
    const parsed = await assertSafeDownloadUrl(
      "https://cdn.example.test/v.mp4",
      publicLookup()
    );
    expect(parsed.protocol).toBe("https:");
  });

  it("sends timeout, size cap, and redirect cap to axios", async () => {
    const stream = new PassThrough();
    stream.end(Buffer.from("hello"));
    axiosMock.mockResolvedValue({ headers: {}, data: stream });

    const dest = tmpDest("v.mp4");
    await downloadUrlToFile("https://cdn.example.test/v.mp4", dest, {
      lookupImpl: publicLookup(),
      maxBytes: 1024,
    });

    expect(axiosMock).toHaveBeenCalledTimes(1);
    expect(axiosMock.mock.calls[0][0]).toMatchObject({
      url: "https://cdn.example.test/v.mp4",
      method: "GET",
      responseType: "stream",
      timeout: 60000,
      maxContentLength: 1024,
      maxRedirects: 5,
    });
    expect(fs.readFileSync(dest, "utf8")).toBe("hello");
  });

  it("refuses an over-limit content-length before streaming", async () => {
    axiosMock.mockResolvedValue({
      headers: { "content-length": "5000" },
      data: new PassThrough(),
    });
    await expect(
      downloadUrlToFile("https://cdn.example.test/v.mp4", tmpDest("v.mp4"), {
        lookupImpl: publicLookup(),
        maxBytes: 1024,
      })
    ).rejects.toThrow(/content-length/i);
    expect(axiosMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a body that grows past the size limit", async () => {
    const stream = new PassThrough();
    stream.end(Buffer.alloc(3000, 7));
    axiosMock.mockResolvedValue({ headers: {}, data: stream });
    await expect(
      downloadUrlToFile("https://cdn.example.test/v.mp4", tmpDest("v.mp4"), {
        lookupImpl: publicLookup(),
        maxBytes: 1024,
      })
    ).rejects.toThrow(/size limit/i);
  });

  it("never calls axios for a blocked URL", async () => {
    await expect(
      downloadUrlToFile("http://169.254.169.254/x", tmpDest("x"), {
        lookupImpl: publicLookup(),
      })
    ).rejects.toThrow(/blocked host/i);
    expect(axiosMock).not.toHaveBeenCalled();
  });

  it("refuses a redirect hop to a private address", async () => {
    await expect(
      resolveRedirectTarget(
        "http://169.254.169.254/latest/meta-data",
        "https://cdn.example.test/start.mp4",
        publicLookup()
      )
    ).rejects.toThrow(/blocked host/i);
  });

  it("refuses a redirect without Location", async () => {
    await expect(
      resolveRedirectTarget(null, "https://cdn.example.test/start.mp4", publicLookup())
    ).rejects.toThrow(/without Location/i);
  });

  it("follows a relative redirect on the same public host", async () => {
    const resolved = await resolveRedirectTarget(
      "/other/clip.mp4",
      "https://cdn.example.test/start.mp4",
      publicLookup()
    );
    expect(resolved.toString()).toBe("https://cdn.example.test/other/clip.mp4");
  });
});

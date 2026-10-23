import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { resolveOrGenerateInputMedia } from "../syntheticMedia";

describe("Synthetic Media Generation & Input Resolution", () => {
  it("resolves existing file without creating synthetic media", () => {
    const tmpFile = path.join(os.tmpdir(), "existing_media_test_" + Date.now() + ".mp4");
    fs.writeFileSync(tmpFile, "dummy video content");

    try {
      const { media, cleanup } = resolveOrGenerateInputMedia(tmpFile, 15);
      expect(media.isSynthetic).toBe(false);
      expect(media.path).toBe(path.resolve(tmpFile));
      expect(media.fileSizeBytes).toBeGreaterThan(0);
      cleanup();
      expect(fs.existsSync(tmpFile)).toBe(true); // Must NOT delete user file
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  });

  it("generates lightweight synthetic media when input path is omitted or absent", () => {
    const { media, cleanup } = resolveOrGenerateInputMedia(undefined, 5);
    expect(media.isSynthetic).toBe(true);
    expect(fs.existsSync(media.path)).toBe(true);
    expect(media.durationSec).toBe(5);
    expect(media.fileSizeBytes).toBeGreaterThan(0);

    cleanup();
    expect(fs.existsSync(media.path)).toBe(false); // Cleaned up
  });
});

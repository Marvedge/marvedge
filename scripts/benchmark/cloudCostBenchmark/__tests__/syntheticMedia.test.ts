import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { resolveOrGenerateInputMedia, validateMediaFile } from "../syntheticMedia";

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

  it("throws clear error when specified input media does not exist", () => {
    expect(() => {
      resolveOrGenerateInputMedia("/nonexistent/file/path.mp4", 5);
    }).toThrow(/does not exist/i);
  });

  it("generates lightweight synthetic media when input path is omitted or absent", () => {
    const { media, cleanup } = resolveOrGenerateInputMedia(undefined, 2);
    expect(media.isSynthetic).toBe(true);
    expect(fs.existsSync(media.path)).toBe(true);
    expect(media.durationSec).toBe(2);
    expect(media.fileSizeBytes).toBeGreaterThan(0);

    // Validate media format
    const validation = validateMediaFile(media.path);
    expect(validation.valid).toBe(true);

    cleanup();
    expect(fs.existsSync(media.path)).toBe(false); // Cleaned up
  });

  it("fails clearly when FFmpeg binary is missing or invalid", () => {
    expect(() => {
      resolveOrGenerateInputMedia(undefined, 2, { ffmpegBin: "nonexistent-ffmpeg-binary" });
    }).toThrow(/FFmpeg binary is unavailable/i);
  });

  it("fails clearly when FFmpeg produces an invalid output file and cleans up", () => {
    const tmpDir = path.join(os.tmpdir(), "marvedge-benchmark");
    const countBefore = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir).length : 0;

    // Use an invalid argument command to simulate ffmpeg failure
    expect(() => {
      resolveOrGenerateInputMedia(undefined, 2, {
        ffmpegBin: "node", // running node without args will exit 1 or fail parsing args
      });
    }).toThrow(/Synthetic media generation failed/i);

    const countAfter = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir).length : 0;
    expect(countAfter).toBe(countBefore);
  });

  it("validateMediaFile catches placeholder text files and empty files", () => {
    const emptyFile = path.join(os.tmpdir(), "empty_test_" + Date.now() + ".mp4");
    fs.writeFileSync(emptyFile, "");

    const placeholderFile = path.join(os.tmpdir(), "placeholder_test_" + Date.now() + ".mp4");
    fs.writeFileSync(placeholderFile, "SYNTHETIC_MEDIA_PLACEHOLDER");

    try {
      const v1 = validateMediaFile(emptyFile);
      expect(v1.valid).toBe(false);
      expect(v1.error).toContain("empty");

      const v2 = validateMediaFile(placeholderFile);
      expect(v2.valid).toBe(false);
      expect(v2.error).toContain("placeholder");
    } finally {
      if (fs.existsSync(emptyFile)) {
        fs.unlinkSync(emptyFile);
      }
      if (fs.existsSync(placeholderFile)) {
        fs.unlinkSync(placeholderFile);
      }
    }
  });
});

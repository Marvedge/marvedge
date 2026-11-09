import { describe, expect, it } from "vitest";
import path from "node:path";
import { isSafeChunkFilename, resolveChunkPath } from "./merge-validation.cjs";
import safeDownload from "./safe-download.cjs";

const { isSafeRecipeId } = safeDownload;

describe("/merge recipe id validation", () => {
  it.each(["recipe123", "a-b_c", "A1_b-2", "x".repeat(128)])(
    "accepts allowlisted recipe id %s",
    (value) => {
      expect(isSafeRecipeId(value)).toBe(true);
    }
  );

  it.each([
    "../../../app/something",
    "../evil",
    "..",
    "/etc/passwd",
    "C:\\Windows\\x",
    "a/b",
    "a\\b",
    "recipe.mp4",
    "",
    "x".repeat(129),
  ])("rejects traversal/absolute recipe id %s", (value) => {
    expect(isSafeRecipeId(value)).toBe(false);
  });

  it("rejects non-string recipe ids", () => {
    expect(isSafeRecipeId(undefined)).toBe(false);
    expect(isSafeRecipeId(null)).toBe(false);
    expect(isSafeRecipeId(42)).toBe(false);
  });

  it("keeps an allowlisted output name contained inside workDir", () => {
    const workDir = path.resolve("work-test");
    expect(resolveChunkPath(workDir, "recipe123.mp4")).toBe(
      path.join(workDir, "recipe123.mp4")
    );
  });

  it.each(["../../../app/something.mp4", "/etc/passwd.mp4", "..\\evil.mp4"])(
    "refuses to resolve recipe output %s inside workDir",
    (name) => {
      expect(resolveChunkPath(path.resolve("work-test"), name)).toBeNull();
    }
  );
});

describe("/merge chunk filename validation", () => {
  it("accepts plain chunk filenames", () => {
    expect(isSafeChunkFilename("recipe123_chunk_0.mp4")).toBe(true);
    expect(isSafeChunkFilename("a-b_c.d.mp4")).toBe(true);
  });

  it.each(["../evil.mp4", "..", "a/../b.mp4", "..."])(
    "rejects dot-dot traversal %s",
    (name) => {
      expect(isSafeChunkFilename(name)).toBe(false);
    }
  );

  it.each(["/etc/passwd", "sub/dir.mp4", "C:\\Windows\\x.mp4", "a\\b.mp4"])(
    "rejects path separators in %s",
    (name) => {
      expect(isSafeChunkFilename(name)).toBe(false);
    }
  );

  it.each([
    "chunk'; rm -rf.mp4",
    'chunk".mp4',
    "chunk'.mp4",
    "chunk`.mp4",
    "chunk$(id).mp4",
    "chunk;evil.mp4",
    "chunk|evil.mp4",
    "chunk with space.mp4",
    "",
  ])("rejects concat-injection payload %s", (name) => {
    expect(isSafeChunkFilename(name)).toBe(false);
  });

  it("rejects non-string entries", () => {
    expect(isSafeChunkFilename(undefined)).toBe(false);
    expect(isSafeChunkFilename(null)).toBe(false);
    expect(isSafeChunkFilename(42)).toBe(false);
  });

  it("resolves safe names inside workDir", () => {
    const workDir = path.resolve("work-test");
    const resolved = resolveChunkPath(workDir, "chunk_0.mp4");
    expect(resolved).toBe(path.join(workDir, "chunk_0.mp4"));
  });

  it.each(["../evil.mp4", "/etc/passwd", ".."])(
    "refuses to resolve %s inside workDir",
    (name) => {
      expect(resolveChunkPath(path.resolve("work-test"), name)).toBeNull();
    }
  );
});

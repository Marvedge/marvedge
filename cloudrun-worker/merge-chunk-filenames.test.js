import { describe, expect, it } from "vitest";
import path from "node:path";
import { isSafeChunkFilename, resolveChunkPath } from "./merge-validation.cjs";

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

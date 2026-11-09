import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { uploadMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
}));

vi.mock("../cloudinary", () => ({
  default: {
    config: vi.fn(),
    uploader: {
      upload: uploadMock,
    },
  },
}));
import { defaultUploadToCloudinary } from "./dubbingProcessor";

describe("defaultUploadToCloudinary temporary-directory cleanup", () => {
  const createdDirs: string[] = [];
  const originalFetch = globalThis.fetch;

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    uploadMock.mockReset();

    for (const dir of createdDirs.splice(0)) {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  it("removes the temporary directory when downloading a local artifact fails", async () => {
    const originalMkdtemp = fs.promises.mkdtemp.bind(fs.promises);
    const mkdtempSpy = vi.spyOn(fs.promises, "mkdtemp").mockImplementation(
      async (prefix, options) => {
        const dir = await originalMkdtemp(prefix, options);
        createdDirs.push(dir);
        return dir;
      }
    );

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("simulated download failure"));

    try {
      await expect(
        defaultUploadToCloudinary("http://localhost:8080/artifacts/aligned.mp4")
      ).rejects.toThrow("simulated download failure");

      expect(mkdtempSpy).toHaveBeenCalledOnce();
      expect(createdDirs).toHaveLength(1);

      const tempDir = createdDirs[0];
      await expect(fs.promises.access(tempDir)).rejects.toThrow();
      expect(uploadMock).not.toHaveBeenCalled();
    } finally {
      mkdtempSpy.mockRestore();
    }
  });
});

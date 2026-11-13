import { describe, expect, it, vi } from "vitest";
import { runAfterReframeStart } from "./startGate";

describe("reframe worker start gate", () => {
  it("skips inference and rendering when the backend ignores a late start", async () => {
    const start = vi.fn().mockResolvedValue({ success: true, ignored: true });
    const process = vi.fn();

    await expect(runAfterReframeStart(start, process)).resolves.toEqual({
      success: true,
      skipped: true,
    });
    expect(process).not.toHaveBeenCalled();
  });

  it("runs the job when the backend accepts the start", async () => {
    const start = vi.fn().mockResolvedValue({ success: true, ignored: false });
    const result = { success: true, exportedUrl: "https://example.com/reframed.mp4" };
    const process = vi.fn().mockResolvedValue(result);

    await expect(runAfterReframeStart(start, process)).resolves.toEqual(result);
    expect(process).toHaveBeenCalledOnce();
  });

  it("propagates a start callback failure without running inference", async () => {
    const error = new Error("Backend unavailable");
    const start = vi.fn().mockRejectedValue(error);
    const process = vi.fn();

    await expect(runAfterReframeStart(start, process)).rejects.toBe(error);
    expect(process).not.toHaveBeenCalled();
  });
});

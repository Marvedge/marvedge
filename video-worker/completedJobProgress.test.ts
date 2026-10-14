import { describe, expect, it, vi } from "vitest";
import { updateCompletedJobProgress } from "./completedJobProgress";

describe("completed job progress reporting", () => {
  it("logs a final progress failure without turning a completed job into a failure", async () => {
    const progressError = new Error("Redis unavailable");
    const updateProgress = vi.fn().mockRejectedValue(progressError);
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      updateCompletedJobProgress("completed-job", "Subtitle", updateProgress)
    ).resolves.toBeUndefined();

    expect(updateProgress).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith(
      "[Subtitle completed-job] Job completed, but final progress could not be updated:",
      progressError
    );
    logError.mockRestore();
  });
});

import { describe, expect, it, vi } from "vitest";

import { runClaimedAvsDubJob } from "./avsDubClaim";

describe("AVS dub worker claim", () => {
  it.each([
    ["FAILED", "AVS_DUB", false],
    ["CANCELLED", "AVS_DUB", false],
    ["COMPLETED", "AVS_DUB", false],
    ["PENDING", "EXPORT", false],
    ["PENDING", "AVS_DUB", true],
    ["PROCESSING", "AVS_DUB", true],
  ])("handles a %s %s job (aligns: %s)", async (status, kind, shouldAlign) => {
    const record = { id: "job-1", status, kind };
    const updateMany = vi.fn<Parameters<typeof runClaimedAvsDubJob>[0]["updateMany"]>(
      async ({ where, data }) => {
        if (
          where.id !== record.id ||
          !where.status.in.includes(record.status) ||
          where.jobData.path.join(".") !== "kind" ||
          where.jobData.equals !== record.kind
        ) {
          return { count: 0 };
        }
        record.status = data.status;
        return { count: 1 };
      }
    );
    const align = vi.fn(async () => {
      expect(record.status).toBe("PROCESSING");
    });

    await runClaimedAvsDubJob({ updateMany }, record.id, align);

    expect(align).toHaveBeenCalledTimes(shouldAlign ? 1 : 0);
    expect(record.status).toBe(shouldAlign ? "PROCESSING" : status);
  });

  it("propagates a claim error without starting alignment", async () => {
    const error = new Error("Database unavailable");
    const updateMany = vi.fn().mockRejectedValue(error);
    const align = vi.fn();

    await expect(runClaimedAvsDubJob({ updateMany }, "job-1", align)).rejects.toBe(error);
    expect(align).not.toHaveBeenCalled();
  });
});

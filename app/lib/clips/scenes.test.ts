import { describe, expect, it } from "vitest";
import { parseFfmpegSceneLog } from "./scenes";

describe("FFmpeg Scene Detection Parser", () => {
  it("parses realistic showinfo pts_time output into contiguous scene spans", () => {
    const sampleLog = `
[Parsed_showinfo_1 @ 000001c92d8a3cc0] config in time_base: 1/12288, frame_rate: 24/1
[Parsed_showinfo_1 @ 000001c92d8a3cc0] n:   180 pts:  92160 pts_time:7.500 pos:  1248560 fmt:yuv420p
[Parsed_showinfo_1 @ 000001c92d8a3cc0] n:   450 pts: 230400 pts_time:18.750 pos: 3125480 fmt:yuv420p
[Parsed_showinfo_1 @ 000001c92d8a3cc0] n:   840 pts: 430080 pts_time:35.000 pos: 5894100 fmt:yuv420p
    `;

    const scenes = parseFfmpegSceneLog(sampleLog, 60.0);

    expect(scenes).toHaveLength(4);
    expect(scenes[0]).toEqual({ startTime: 0, endTime: 7.5 });
    expect(scenes[1]).toEqual({ startTime: 7.5, endTime: 18.75 });
    expect(scenes[2]).toEqual({ startTime: 18.75, endTime: 35.0 });
    expect(scenes[3]).toEqual({ startTime: 35.0, endTime: 60.0 });
  });

  it("deduplicates scene cut points that are too close together (< 0.2s)", () => {
    const sampleLog = `
[Parsed_showinfo_1] pts_time:10.000
[Parsed_showinfo_1] pts_time:10.050
[Parsed_showinfo_1] pts_time:10.120
[Parsed_showinfo_1] pts_time:25.000
    `;

    const scenes = parseFfmpegSceneLog(sampleLog, 40.0);

    // 10.05 and 10.12 are filtered out because they are within 0.2s of 10.0
    expect(scenes).toHaveLength(3);
    expect(scenes[0]).toEqual({ startTime: 0, endTime: 10.0 });
    expect(scenes[1]).toEqual({ startTime: 10.0, endTime: 25.0 });
    expect(scenes[2]).toEqual({ startTime: 25.0, endTime: 40.0 });
  });

  it("returns a single full-video scene when no cuts are detected", () => {
    const emptyLog = "ffmpeg banner info\nframe=100 fps=30\n";
    const scenes = parseFfmpegSceneLog(emptyLog, 45.0);

    expect(scenes).toEqual([{ startTime: 0, endTime: 45.0 }]);
  });

  it("handles empty or malformed strings gracefully", () => {
    expect(parseFfmpegSceneLog("", 30.0)).toEqual([{ startTime: 0, endTime: 30.0 }]);
    expect(parseFfmpegSceneLog("", 0)).toEqual([]);
  });

  it("executes real FFmpeg on sample video to detect scene boundaries", async () => {
    const { detectSceneCuts } = await import("./scenes");
    const scenes = await detectSceneCuts("public/icons/autoflip_1_demo.mp4", {
      totalDuration: 7.2,
      threshold: 0.2,
    });

    expect(Array.isArray(scenes)).toBe(true);
    expect(scenes.length).toBeGreaterThanOrEqual(1);
    expect(scenes[0].startTime).toBe(0);
    expect(scenes[scenes.length - 1].endTime).toBe(7.2);
  });
});

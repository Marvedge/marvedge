import { createRequire } from "node:module";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const requireCjs = createRequire(import.meta.url);

// Mock storage before loading the CommonJS render module.
const storagePath = requireCjs.resolve("./storage.cjs");
const storageMock = {
  downloadFromUri: vi.fn(async ({ destinationPath }) => {
    const payload = {
      schema: "marvedge.speaker-tracks",
      schema_version: 1,
      source: {
        width: 1280,
        height: 720,
        fps: 30,
        duration_sec: 10,
      },
      speakers: [
        {
          track_id: "speaker-0",
          start_sec: 0,
          end_sec: 10,
          average_confidence: 0.9,
          frames: [
            {
              frame: 0,
              timestamp_sec: 0,
              bbox: [150, 100, 250, 300],
              speaking_score: 1,
              is_speaking: true,
            },
          ],
        },
        {
          track_id: "speaker-1",
          start_sec: 0,
          end_sec: 10,
          average_confidence: 0.9,
          frames: [
            {
              frame: 0,
              timestamp_sec: 0,
              bbox: [750, 100, 850, 300],
              speaking_score: 1,
              is_speaking: true,
            },
          ],
        },
      ],
    };

    fs.writeFileSync(destinationPath, JSON.stringify(payload), "utf8");
  }),
};

requireCjs.cache[storagePath] = {
  id: storagePath,
  filename: storagePath,
  loaded: true,
  exports: storageMock,
};

// Mock fluent-ffmpeg so tests never launch the real binary.
const ffmpegPath = requireCjs.resolve("fluent-ffmpeg");

let endCallback;
let errorCallback;

const mockChain = {
  on: vi.fn((event, callback) => {
    if (event === "end") endCallback = callback;
    if (event === "error") errorCallback = callback;
    return mockChain;
  }),
  complexFilter: vi.fn(() => mockChain),
  videoCodec: vi.fn(() => mockChain),
  audioCodec: vi.fn(() => mockChain),
  outputOptions: vi.fn(() => mockChain),
  output: vi.fn(() => mockChain),
  inputOptions: vi.fn(() => mockChain),
  input: vi.fn(() => mockChain),
  run: vi.fn(() => {
    if (endCallback) process.nextTick(() => endCallback());
    return mockChain;
  }),
};

function ffmpegMock() {
  endCallback = null;
  errorCallback = null;
  return mockChain;
}

ffmpegMock.ffprobe = (_input, callback) => {
  callback(null, {
    streams: [
      { codec_type: "video", width: 1280, height: 720 },
    ],
    format: { duration: "10" },
  });
};
ffmpegMock.setFfprobePath = vi.fn();
ffmpegMock.setFfmpegPath = vi.fn();

requireCjs.cache[ffmpegPath] = {
  id: ffmpegPath,
  filename: ffmpegPath,
  loaded: true,
  exports: ffmpegMock,
};

// Keep the real parser/decision logic, but mock filter-graph construction.
const splitPath = requireCjs.resolve("./split-screen-blur.js");
const actualSplit = requireCjs(splitPath);

const splitMock = {
  ...actualSplit,
  evaluateSplitScreen: vi.fn(actualSplit.evaluateSplitScreen),
  buildSplitScreenFilterGraph: vi.fn(() => ({
    filter: "[split_filter]",
  })),
};

requireCjs.cache[splitPath] = {
  id: splitPath,
  filename: splitPath,
  loaded: true,
  exports: splitMock,
};

// Load render only after its CommonJS dependencies are isolated.
const { renderChunkFromRecipe } = requireCjs("./render.js");

const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "render-test-")
);
const inputPath = path.join(tempDir, "input.mp4");
const outputPath = path.join(tempDir, "output.mp4");
fs.writeFileSync(inputPath, "");

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });

  delete requireCjs.cache[storagePath];
  delete requireCjs.cache[ffmpegPath];
  delete requireCjs.cache[splitPath];

  const renderPath = requireCjs.resolve("./render.js");
  delete requireCjs.cache[renderPath];
});

describe("renderChunkFromRecipe speakerTracksUri storage handling", () => {
  it("downloads cloud URI and triggers split-screen", async () => {
    await renderChunkFromRecipe({
      inputPath,
      outputPath,
      chunkId: "test1",
      recipe: {},
      chunkDurationSecs: 10,
      startTime: 0,
      duration: 10,
      speakerTracksUri: "gs://bucket/speaker-tracks.json",
    });

    expect(storageMock.downloadFromUri).toHaveBeenCalledOnce();
    expect(storageMock.downloadFromUri).toHaveBeenCalledWith({
      uri: "gs://bucket/speaker-tracks.json",
      destinationPath: path.join(tempDir, "speaker-tracks.json"),
    });

    const callArg = splitMock.evaluateSplitScreen.mock.calls[0][0];
    expect(callArg).toBe(path.join(tempDir, "speaker-tracks.json"));

    const fileContent = JSON.parse(
      fs.readFileSync(callArg, "utf8")
    );
    expect(fileContent.speakers).toHaveLength(2);

    expect(
       splitMock.buildSplitScreenFilterGraph
    ).toHaveBeenCalledOnce();

    const graphArgs =
        splitMock.buildSplitScreenFilterGraph.mock.calls[0][0];

    expect(graphArgs.sourceWidth).toBe(1280);
    expect(graphArgs.sourceHeight).toBe(720);
    expect(graphArgs.speaker1.x).toBe(200);
    expect(graphArgs.speaker2.x).toBe(800);

    expect(mockChain.run).toHaveBeenCalledOnce();
  });

  it("falls back safely when storage download fails", async () => {
    storageMock.downloadFromUri.mockRejectedValueOnce(
      new Error("download error")
    );

    await renderChunkFromRecipe({
      inputPath,
      outputPath,
      chunkId: "test2",
      recipe: {},
      chunkDurationSecs: 10,
      startTime: 0,
      duration: 10,
      speakerTracksUri: "gs://bucket/bad.json",
    });

    expect(storageMock.downloadFromUri).toHaveBeenCalledOnce();
    expect(
      splitMock.evaluateSplitScreen.mock.calls[0][0]
    ).toBeNull();

    expect(
      splitMock.buildSplitScreenFilterGraph
    ).not.toHaveBeenCalled();

    expect(mockChain.run).toHaveBeenCalledOnce();
  });
});

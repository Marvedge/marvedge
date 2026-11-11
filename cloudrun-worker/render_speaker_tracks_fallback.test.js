// Fixture tests for speaker‑track fallback scenarios
import { createRequire } from "node:module";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const requireCjs = createRequire(import.meta.url);

// Mock storage
const storagePath = requireCjs.resolve("./storage.cjs");
const storageMock = {
  downloadFromUri: vi.fn(async ({ destinationPath }) => {
    // default: write a two‑speaker payload; individual tests will override via mockImplementationOnce
    const payload = {
      schema: "marvedge.speaker-tracks",
      schema_version: 1,
      source: { width: 1280, height: 720, fps: 30, duration_sec: 10 },
      speakers: [
        {
          track_id: "speaker-0",
          start_sec: 0,
          end_sec: 10,
          average_confidence: 0.9,
          frames: [{ frame: 0, timestamp_sec: 0, bbox: [150,100,250,300], speaking_score: 1, is_speaking: true }],
        },
        {
          track_id: "speaker-1",
          start_sec: 0,
          end_sec: 10,
          average_confidence: 0.9,
          frames: [{ frame: 0, timestamp_sec: 0, bbox: [750,100,850,300], speaking_score: 1, is_speaking: true }],
        },
      ],
    };
    fs.writeFileSync(destinationPath, JSON.stringify(payload), "utf8");
  }),
};
requireCjs.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: storageMock };

// Mock fluent‑ffmpeg (same as existing test)
const ffmpegPath = requireCjs.resolve("fluent-ffmpeg");
let endCallback;
let errorCallback;
const mockChain = {
  on: vi.fn((event, cb) => { if (event === "end") endCallback = cb; if (event === "error") errorCallback = cb; return mockChain; }),
  complexFilter: vi.fn(() => mockChain),
  videoCodec: vi.fn(() => mockChain),
  audioCodec: vi.fn(() => mockChain),
  outputOptions: vi.fn(() => mockChain),
  output: vi.fn(() => mockChain),
  inputOptions: vi.fn(() => mockChain),
  input: vi.fn(() => mockChain),
  run: vi.fn(() => { if (endCallback) process.nextTick(() => endCallback()); return mockChain; }),
};
function ffmpegMock() { endCallback = null; errorCallback = null; return mockChain; }
ffmpegMock.ffprobe = (_input, cb) => cb(null, { streams: [{ codec_type: "video", width: 1280, height: 720 }], format: { duration: "10" } });
ffmpegMock.setFfprobePath = vi.fn();
ffmpegMock.setFfmpegPath = vi.fn();
requireCjs.cache[ffmpegPath] = { id: ffmpegPath, filename: ffmpegPath, loaded: true, exports: ffmpegMock };

// Mock split‑screen‑blur but keep real logic for evaluateSplitScreen
const splitPath = requireCjs.resolve("./split-screen-blur.js");
const actualSplit = requireCjs(splitPath);
const splitMock = {
  ...actualSplit,
  evaluateSplitScreen: vi.fn(actualSplit.evaluateSplitScreen),
  buildSplitScreenFilterGraph: vi.fn(() => ({ filter: "[split_filter]" })),
};
requireCjs.cache[splitPath] = { id: splitPath, filename: splitPath, loaded: true, exports: splitMock };

// Load render after mocks
const { renderChunkFromRecipe } = requireCjs("./render.js");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "render-fallback-test-"));
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

describe("renderChunkFromRecipe speaker‑track fallback scenarios", () => {
  it("handles missing speakerTracksUri (undefined) with safe fallback", async () => {
    await renderChunkFromRecipe({
      inputPath,
      outputPath,
      chunkId: "missing",
      recipe: {},
      chunkDurationSecs: 10,
      startTime: 0,
      duration: 10,
      speakerTracksUri: undefined,
    });
    // No download should be attempted
    expect(storageMock.downloadFromUri).not.toHaveBeenCalled();
    // evaluateSplitScreen receives undefined and fallback flag set
    // Verify evaluateSplitScreen was called with undefined URI and a numeric width
const callArgs = splitMock.evaluateSplitScreen.mock.calls[0];
expect(callArgs[0]).toBeUndefined();
expect(typeof callArgs[1]).toBe("number");
expect(callArgs).toHaveLength(2); // No config argument expected when speakerTracksUri is missing
    const result = splitMock.evaluateSplitScreen.mock.results[0].value;
    expect(result.fallback).toBe(true);
    expect(result.splitScreen).toBe(false);
    // No split‑screen filter should be added – only the normal crop (ffmpeg run still called)
    expect(splitMock.buildSplitScreenFilterGraph).not.toHaveBeenCalled();
    expect(mockChain.run).toHaveBeenCalledOnce();
  });

  it("handles empty speaker‑tracks file with safe fallback", async () => {
    storageMock.downloadFromUri.mockImplementationOnce(async ({ destinationPath }) => {
      fs.writeFileSync(destinationPath, "{}", "utf8"); // empty content
    });
    await renderChunkFromRecipe({
      inputPath,
      outputPath,
      chunkId: "empty",
      recipe: {},
      chunkDurationSecs: 10,
      startTime: 0,
      duration: 10,
      speakerTracksUri: "gs://bucket/empty.json",
    });
    expect(storageMock.downloadFromUri).toHaveBeenCalledOnce();
    const argPath = splitMock.evaluateSplitScreen.mock.calls[0][0];
    const parsed = JSON.parse(fs.readFileSync(argPath, "utf8"));
    expect(parsed).toEqual({});
    const evalResult = splitMock.evaluateSplitScreen.mock.results[0].value;
    expect(evalResult.fallback).toBe(true);
    expect(evalResult.splitScreen).toBe(false);
    expect(splitMock.buildSplitScreenFilterGraph).not.toHaveBeenCalled();
    expect(mockChain.run).toHaveBeenCalledOnce();
  });

  it("handles single‑speaker track with warning and fallback", async () => {
    storageMock.downloadFromUri.mockImplementationOnce(async ({ destinationPath }) => {
      const payload = {
        schema: "marvedge.speaker-tracks",
        schema_version: 1,
        source: { width: 1280, height: 720, fps: 30, duration_sec: 10 },
        speakers: [
          {
            track_id: "speaker-0",
            start_sec: 0,
            end_sec: 10,
            average_confidence: 0.9,
            frames: [{ frame: 0, timestamp_sec: 0, bbox: [200, 100, 300, 300], speaking_score: 1, is_speaking: true }],
          },
        ],
      };
      fs.writeFileSync(destinationPath, JSON.stringify(payload), "utf8");
    });
    await renderChunkFromRecipe({
      inputPath,
      outputPath,
      chunkId: "single",
      recipe: {},
      chunkDurationSecs: 10,
      startTime: 0,
      duration: 10,
      speakerTracksUri: "gs://bucket/single.json",
    });
    expect(storageMock.downloadFromUri).toHaveBeenCalledOnce();
    const evalResult = splitMock.evaluateSplitScreen.mock.results[0].value;
    expect(evalResult.fallback).toBe(true);
    expect(evalResult.splitScreen).toBe(false);
    expect(splitMock.buildSplitScreenFilterGraph).not.toHaveBeenCalled();
    expect(mockChain.run).toHaveBeenCalledOnce();
  });

  it("processes two‑speaker tracks normally (already covered)", async () => {
    // reuse default two‑speaker payload from the default mock implementation
    await renderChunkFromRecipe({
      inputPath,
      outputPath,
      chunkId: "two",
      recipe: {},
      chunkDurationSecs: 10,
      startTime: 0,
      duration: 10,
      speakerTracksUri: "gs://bucket/two.json",
    });
    expect(storageMock.downloadFromUri).toHaveBeenCalledOnce();
    const evalResult = splitMock.evaluateSplitScreen.mock.results[0].value;
    expect(evalResult.fallback).toBe(false);
    expect(evalResult.splitScreen).toBe(true);
    expect(splitMock.buildSplitScreenFilterGraph).toHaveBeenCalledOnce();
    expect(mockChain.run).toHaveBeenCalledOnce();
  });
});

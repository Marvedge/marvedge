import { describe, expect, it, vi } from "vitest";
import { VoiceStudioClient } from "../client";
import {
  VoiceStudioDubbingAdapter,
  concatenateWavBuffers,
  resolveDubbingProvider,
} from "../dubbingAdapter";

function createMockWav(seconds: number = 1.0): Buffer {
  const sampleRate = 16000;
  const numChannels = 1;
  const bytesPerSample = 2;
  const dataSize = Math.floor(sampleRate * seconds * numChannels * bytesPerSample);
  const buf = Buffer.alloc(44 + dataSize);

  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buf.writeUInt16LE(numChannels * bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);

  return buf;
}

describe("VoiceStudioDubbingAdapter", () => {
  it("A. resolveDubbingProvider preserves elevenlabs as default", () => {
    expect(resolveDubbingProvider()).toBe("elevenlabs");
    expect(resolveDubbingProvider({ configuredProvider: "elevenlabs" })).toBe("elevenlabs");
    expect(resolveDubbingProvider({ configuredProvider: "" })).toBe("elevenlabs");
  });

  it("B. resolveDubbingProvider only returns voicestudio on explicit selection", () => {
    expect(resolveDubbingProvider({ configuredProvider: "voicestudio" })).toBe("voicestudio");
    expect(resolveDubbingProvider({ configuredProvider: "VOICESTUDIO" })).toBe("voicestudio");
  });

  it("C. concatenateWavBuffers updates header sizes accurately", () => {
    const chunk1 = createMockWav(1.0);
    const chunk2 = createMockWav(2.0);

    const combined = concatenateWavBuffers([chunk1, chunk2]);
    expect(combined.toString("ascii", 0, 4)).toBe("RIFF");
    expect(combined.toString("ascii", 8, 12)).toBe("WAVE");

    const totalDataLen = chunk1.length - 44 + (chunk2.length - 44);
    expect(combined.readUInt32LE(40)).toBe(totalDataLen);
    expect(combined.length).toBe(44 + totalDataLen);
  });

  it("D. synthesizeTimedSteps synthesizes step-by-step and tracks accurate timelines", async () => {
    const mockClient = new VoiceStudioClient();
    vi.spyOn(mockClient, "generateSpeech").mockImplementation(async (req) => {
      const dur = req.targetDurationSec || 2.0;
      return {
        audio: createMockWav(dur),
        contentType: "audio/wav",
        format: "wav",
        fileSizeBytes: 44 + Math.floor(16000 * dur * 2),
        durationSec: dur,
        timing: {
          wallClockMs: 50,
        },
      };
    });

    const adapter = new VoiceStudioDubbingAdapter(mockClient);

    const steps = [
      { stepId: "step-1", text: "Introduction step", targetDurationSec: 2.0 },
      { stepId: "step-2", text: "Second explanation step", targetDurationSec: 3.5 },
    ];

    const result = await adapter.synthesizeTimedSteps(steps, { language: "es" });

    expect(result.format).toBe("wav");
    expect(result.durationSec).toBe(5.5);
    expect(result.stepTimings).toHaveLength(2);

    expect(result.stepTimings[0]).toEqual({
      stepId: "step-1",
      start: 0,
      end: 2.0,
      durationSec: 2.0,
    });

    expect(result.stepTimings[1]).toEqual({
      stepId: "step-2",
      start: 2.0,
      end: 5.5,
      durationSec: 3.5,
    });

    expect(result.audioBuffer.length).toBeGreaterThan(44);
  });

  it("E. synthesizeTimedSteps rejects empty steps array with clear error", async () => {
    const adapter = new VoiceStudioDubbingAdapter(new VoiceStudioClient());
    await expect(adapter.synthesizeTimedSteps([])).rejects.toThrowError(
      "No valid steps provided for timed dubbing synthesis"
    );
  });
});

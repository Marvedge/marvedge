import { describe, expect, it } from "vitest";
import { assertValidAudio, validateAudioMagicBytes } from "../validateAudio";
import { VoiceStudioAudioValidationError } from "../errors";

describe("VoiceStudio validateAudio", () => {
  it("A. identifies and accepts valid WAV headers", () => {
    const validWav = Buffer.alloc(44);
    validWav.write("RIFF", 0, "ascii");
    validWav.writeUInt32LE(36, 4);
    validWav.write("WAVE", 8, "ascii");

    const result = validateAudioMagicBytes(validWav, "wav");
    expect(result.isValid).toBe(true);
    expect(result.detectedFormat).toBe("wav");
  });

  it("B. rejects truncated WAV buffer smaller than 44 bytes", () => {
    const truncatedWav = Buffer.alloc(20);
    truncatedWav.write("RIFF", 0, "ascii");
    truncatedWav.write("WAVE", 8, "ascii");

    const result = validateAudioMagicBytes(truncatedWav, "wav");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Truncated WAV header");
  });

  it("C. identifies valid MP3 headers (ID3 tag and MPEG sync frame)", () => {
    // ID3 tagged
    const id3Mp3 = Buffer.alloc(10);
    id3Mp3.write("ID3", 0, "ascii");
    expect(validateAudioMagicBytes(id3Mp3, "mp3").isValid).toBe(true);

    // MPEG sync frame (0xFFFB)
    const syncMp3 = Buffer.from([0xff, 0xfb, 0x90, 0x44]);
    expect(validateAudioMagicBytes(syncMp3, "mp3").isValid).toBe(true);
  });

  it("D. identifies valid OGG containers", () => {
    const oggBuf = Buffer.from("OggS" + "\x00".repeat(10), "binary");
    expect(validateAudioMagicBytes(oggBuf, "ogg").isValid).toBe(true);
  });

  it("E. rejects empty buffers with clear error", () => {
    const emptyBuf = Buffer.alloc(0);
    const result = validateAudioMagicBytes(emptyBuf);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Audio buffer is empty");
  });

  it("F. detects and rejects server HTML / JSON error pages disguised as audio", () => {
    const htmlErr = Buffer.from("<!DOCTYPE html><html><body>502 Bad Gateway</body></html>");
    const jsonErr = Buffer.from('{"detail": "Model failed to load"}');

    expect(validateAudioMagicBytes(htmlErr).isValid).toBe(false);
    expect(validateAudioMagicBytes(htmlErr).error).toContain("text/html/json payload");

    expect(validateAudioMagicBytes(jsonErr).isValid).toBe(false);
    expect(validateAudioMagicBytes(jsonErr).error).toContain("text/html/json payload");
  });

  it("G. assertValidAudio throws VoiceStudioAudioValidationError on invalid payload", async () => {
    const badBuf = Buffer.from("NOT_AUDIO_DATA_AT_ALL");
    await expect(assertValidAudio(badBuf, "wav")).rejects.toThrowError(
      VoiceStudioAudioValidationError
    );
  });
});

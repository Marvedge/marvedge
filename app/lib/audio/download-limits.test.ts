import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("axios", () => ({ default: mocks.request }));

import { downloadAudioToFile } from "./media";
import { AUDIO_MAX_BYTES } from "./validation";

const directories: string[] = [];

afterEach(() => {
  vi.resetAllMocks();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("audio worker download byte limit", () => {
  it("accepts exactly the audio byte limit", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "audio-download-boundary-"));
    directories.push(directory);
    const destination = path.join(directory, "input");
    const chunk = Buffer.alloc(1024 * 1024);

    mocks.request.mockResolvedValueOnce({
      data: Readable.from(
        (async function* () {
          for (let remaining = AUDIO_MAX_BYTES; remaining > 0; ) {
            const size = Math.min(chunk.length, remaining);
            yield chunk.subarray(0, size);
            remaining -= size;
          }
        })(),
        { objectMode: false }
      ),
      headers: {},
    });

    await downloadAudioToFile("https://signed.example.test/audio", destination);

    expect(fs.statSync(destination).size).toBe(AUDIO_MAX_BYTES);
  });

  it("rejects one byte beyond the audio byte limit", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "audio-download-overflow-"));
    directories.push(directory);
    const destination = path.join(directory, "input");
    const chunk = Buffer.alloc(1024 * 1024);

    const upstream = Readable.from(
      (async function* () {
        for (let remaining = AUDIO_MAX_BYTES; remaining > 0; ) {
          const size = Math.min(chunk.length, remaining);
          yield chunk.subarray(0, size);
          remaining -= size;
        }
        yield Buffer.from([1]);
      })(),
      { objectMode: false }
    );

    mocks.request.mockResolvedValueOnce({ data: upstream, headers: {} });

    await expect(
      downloadAudioToFile("https://signed.example.test/audio", destination)
    ).rejects.toThrow(/50MB|size limit|too large/i);

    expect(upstream.destroyed).toBe(true);
    if (fs.existsSync(destination)) {
      expect(fs.statSync(destination).size).toBeLessThanOrEqual(AUDIO_MAX_BYTES);
    }
  });

  it.each([
    ["missing", {}],
    ["understated", { "content-length": "1024" }],
  ])("stops oversized audio with %s content-length", async (_label, headers) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "audio-download-limit-"));
    directories.push(directory);
    const destination = path.join(directory, "input");
    const chunk = Buffer.alloc(1024 * 1024);
    let produced = 0;

    const upstream = Readable.from(
      (async function* () {
        for (let index = 0; index < 80; index++) {
          produced++;
          yield chunk;
        }
      })(),
      { objectMode: false }
    );

    mocks.request.mockResolvedValueOnce({ data: upstream, headers });

    await expect(
      downloadAudioToFile("https://signed.example.test/audio", destination)
    ).rejects.toThrow(/50MB|size limit|too large/i);

    expect(produced).toBeLessThan(80);
    expect(upstream.destroyed).toBe(true);

    if (fs.existsSync(destination)) {
      expect(fs.statSync(destination).size).toBeLessThanOrEqual(AUDIO_MAX_BYTES);
    }
  });

  it("downloads valid audio unchanged", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "audio-download-valid-"));
    directories.push(directory);
    const destination = path.join(directory, "input");
    const bytes = Buffer.from("small audio fixture");

    mocks.request.mockResolvedValueOnce({
      data: Readable.from([bytes]),
      headers: {},
    });

    await downloadAudioToFile("https://signed.example.test/audio", destination);

    expect(fs.readFileSync(destination)).toEqual(bytes);
  });
});

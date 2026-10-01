import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

import { uploadDubFile } from "./upload";

vi.mock("axios");

const mockPost = vi.mocked(axios.post);
const mockPut = vi.mocked(axios.put);
const mockGet = vi.mocked(axios.get);

const FILE = { name: "dub.mp3", type: "audio/mpeg", size: 1024 } as File;

afterEach(() => {
  vi.clearAllMocks();
});

describe("uploadDubFile", () => {
  it("presigns, PUTs, confirms and returns the playable URL", async () => {
    mockPost
      .mockResolvedValueOnce({ data: { clipId: "clip-1", uploadUrl: "https://signed/put" } })
      .mockResolvedValueOnce({ data: { success: true } });
    mockGet.mockResolvedValueOnce({
      data: {
        clips: [
          { id: "clip-0", originalUrl: "https://cdn/other.mp3" },
          { id: "clip-1", originalUrl: "https://cdn/dub.mp3" },
        ],
      },
    });

    const result = await uploadDubFile("demo-1", FILE, 12.5);

    expect(result).toEqual({ url: "https://cdn/dub.mp3", duration: 12.5 });
    expect(mockPost).toHaveBeenNthCalledWith(1, "/api/demos/demo-1/audio/presign", {
      fileName: "dub.mp3",
      mimeType: "audio/mpeg",
      size: 1024,
    });
    expect(mockPut).toHaveBeenCalledWith(
      "https://signed/put",
      FILE,
      expect.objectContaining({ headers: { "Content-Type": "audio/mpeg" } })
    );
    expect(mockPost).toHaveBeenNthCalledWith(2, "/api/audio/clip-1/confirm", {
      durationSec: 12.5,
    });
  });

  it("throws when the presign response has no clip id", async () => {
    mockPost.mockResolvedValueOnce({ data: { uploadUrl: "https://signed/put" } });
    await expect(uploadDubFile("demo-1", FILE, 5)).rejects.toThrow("Upload did not start");
  });

  it("throws when the uploaded clip is not returned by the list", async () => {
    mockPost
      .mockResolvedValueOnce({ data: { clipId: "clip-1", uploadUrl: "https://signed/put" } })
      .mockResolvedValueOnce({ data: { success: true } });
    mockGet.mockResolvedValueOnce({ data: { clips: [{ id: "clip-other" }] } });

    await expect(uploadDubFile("demo-1", FILE, 5)).rejects.toThrow("no playable URL was returned");
  });

  it("confirms with null duration when the file duration is not readable", async () => {
    mockPost
      .mockResolvedValueOnce({ data: { clipId: "clip-1", uploadUrl: "https://signed/put" } })
      .mockResolvedValueOnce({ data: { success: true } });
    mockGet.mockResolvedValueOnce({
      data: { clips: [{ id: "clip-1", originalUrl: "https://cdn/dub.mp3" }] },
    });

    await uploadDubFile("demo-1", FILE, NaN);

    expect(mockPost).toHaveBeenNthCalledWith(2, "/api/audio/clip-1/confirm", {
      durationSec: null,
    });
  });
});

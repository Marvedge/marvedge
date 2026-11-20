import axios from "axios";
import { afterEach, expect, it, vi } from "vitest";
import { useAudioClipStore } from "./audioClipStore";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useAudioClipStore.getState().reset();
});

it("retries confirmation after a 503 without re-uploading or deleting the clip", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:audio-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal(
    "Audio",
    class {
      duration = 12;
      onloadedmetadata?: () => void;

      set src(_url: string) {
        this.onloadedmetadata?.();
      }
    }
  );

  const post = vi
    .spyOn(axios, "post")
    .mockResolvedValueOnce({ data: { clipId: "clip-1", uploadUrl: "https://example.test/upload" } })
    .mockRejectedValueOnce({ isAxiosError: true, response: { status: 503 } })
    .mockResolvedValueOnce({ data: { success: true } });
  const put = vi.spyOn(axios, "put").mockResolvedValue({});
  const remove = vi.spyOn(axios, "delete").mockResolvedValue({});
  vi.spyOn(axios, "get").mockResolvedValue({ data: { clips: [] } });

  const file = new File(["fixture"], "voice.mp3", { type: "audio/mpeg" });
  await useAudioClipStore.getState().uploadFile("demo-1", file);

  expect(put).toHaveBeenCalledOnce();
  expect(post.mock.calls.map(([url]) => url)).toEqual([
    "/api/demos/demo-1/audio/presign",
    "/api/audio/clip-1/confirm",
    "/api/audio/clip-1/confirm",
  ]);
  expect(remove).not.toHaveBeenCalled();
  expect(useAudioClipStore.getState().uploads).toEqual([]);
});

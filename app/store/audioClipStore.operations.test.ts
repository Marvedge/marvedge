import axios from "axios";
import { afterEach, expect, it, vi } from "vitest";
import type { AudioClipDto } from "@/app/types/audio";
import { useAudioClipStore } from "./audioClipStore";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useAudioClipStore.getState().reset();
});

function clip(id: string, order: number): AudioClipDto {
  return {
    id,
    fileName: `${id}.mp3`,
    mimeType: "audio/mpeg",
    durationSec: 12,
    trimStartSec: 0,
    trimEndSec: null,
    order,
    status: "READY",
    error: null,
    originalUrl: "https://example.test/audio.mp3",
    trimmedUrl: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

it("cancels an upload while the browser is still reading metadata", async () => {
  const metadataStarted = Promise.withResolvers<void>();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:audio-test");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal(
    "Audio",
    class {
      set src(_url: string) {
        metadataStarted.resolve();
      }

      removeAttribute() {}

      load() {}
    }
  );

  const post = vi.spyOn(axios, "post").mockResolvedValue({
    data: { clipId: "clip-1", uploadUrl: "https://example.test/upload" },
  });
  vi.spyOn(axios, "put").mockResolvedValue({});
  const remove = vi.spyOn(axios, "delete").mockResolvedValue({});
  vi.spyOn(axios, "get").mockResolvedValue({ data: { clips: [] } });

  const store = useAudioClipStore.getState();
  const upload = store.uploadFile("demo-1", new File(["audio"], "clip.mp3"));
  await metadataStarted.promise;
  store.cancelUpload(useAudioClipStore.getState().uploads[0].id);

  // Allow the cancellation handler to settle without completing metadata.
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(revoke).toHaveBeenCalledWith("blob:audio-test");
  expect(remove).toHaveBeenCalledExactlyOnceWith("/api/audio/clip-1");
  expect(post).toHaveBeenCalledOnce();
  expect(useAudioClipStore.getState().uploads).toEqual([]);
  await upload;
});

it("restores only the clip whose delete failed", async () => {
  const original = clip("clip-1", 0);
  const second = clip("clip-2", 1);
  const third = clip("clip-3", 2);
  const firstDelete = Promise.withResolvers<never>();
  const failure = new Error("Delete failed");
  vi.spyOn(axios, "delete").mockImplementation((url) =>
    url === "/api/audio/clip-1" ? firstDelete.promise : Promise.resolve({})
  );
  vi.spyOn(axios, "patch").mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
  useAudioClipStore.setState({ clips: [original, second, third] });

  const store = useAudioClipStore.getState();
  const failedDelete = expect(store.deleteClip(original.id)).rejects.toBe(failure);
  await store.deleteClip(second.id);
  await store.renameClip(third.id, "updated.mp3");
  firstDelete.reject(failure);
  await failedDelete;

  expect(useAudioClipStore.getState().clips).toEqual([
    original,
    { ...third, fileName: "updated.mp3" },
  ]);
});

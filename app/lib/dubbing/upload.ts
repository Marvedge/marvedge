// Dub-track upload, reusing the audio-clip storage path end to end so no new
// backend route is needed: POST /api/demos/:id/audio/presign → pre-signed PUT →
// POST /api/audio/:clipId/confirm, then read the playable https URL from the
// demo's audio-clip list (the same flow AudioPanel uses, and the dub track ends
// up listed as an audio clip of the demo — which is subject to the same
// audio-flag as the Audio tab itself).
//
// The returned url is a public https URL, which is what POST /api/avs/dub
// needs: the worker downloads the dub track server-side, so a blob: URL would
// never be fetchable there.

import axios from "axios";

export interface UploadedDub {
  url: string;
  duration: number;
}

/**
 * Try to read an audio file's duration in the browser. Returns null when the
 * metadata cannot be loaded (wrong type, empty file, …).
 */
export function readAudioFileDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    audio.src = url;
  });
}

/**
 * Upload a dub track through the audio storage endpoints and resolve with its
 * playable https url + duration. Throws with a message the panel can show.
 */
export async function uploadDubFile(
  demoId: string,
  file: File,
  durationSec: number,
  onProgress?: (percent: number) => void
): Promise<UploadedDub> {
  const presign = await axios.post(`/api/demos/${demoId}/audio/presign`, {
    fileName: file.name,
    mimeType: file.type || "audio/mpeg",
    size: file.size,
  });
  const { clipId, uploadUrl } = presign.data as { clipId: string; uploadUrl: string };
  if (!clipId || !uploadUrl) {
    throw new Error("Upload did not start");
  }

  await axios.put(uploadUrl, file, {
    headers: { "Content-Type": file.type || "audio/mpeg" },
    onUploadProgress: (event) => {
      if (event.total) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    },
    maxBodyLength: Infinity,
  });

  await axios.post(`/api/audio/${clipId}/confirm`, {
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : null,
  });

  const clipsRes = await axios.get(`/api/demos/${demoId}/audio`);
  const clips = (clipsRes.data?.clips ?? []) as Array<{ id?: string; originalUrl?: string }>;
  const clip = clips.find((c) => c.id === clipId);
  if (!clip?.originalUrl) {
    throw new Error("Upload finished but no playable URL was returned");
  }
  return {
    url: clip.originalUrl,
    duration: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0,
  };
}

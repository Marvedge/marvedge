import { eventTemplate, type EditorEvent } from "./editor-model";

export function readVideoClip(file: File): Promise<EditorEvent> {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const timer = window.setTimeout(() => finish(false), 10000);
    function finish(valid: boolean) {
      window.clearTimeout(timer);
      const duration = video.duration;
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      if (!valid || !Number.isFinite(duration) || duration <= 0) {
        URL.revokeObjectURL(source);
        reject(new Error("This video could not be opened. Try an MP4 or WebM file."));
        return;
      }
      resolve({ ...eventTemplate("video", "Recording"), source, name: file.name, duration, sourceDuration: duration, sourceOffset: 0 });
    }
    video.onloadedmetadata = () => finish(true);
    video.onerror = () => finish(false);
    video.src = source;
  });
}
export async function readAudioClip(file: File, start: number): Promise<EditorEvent> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Audio isn't supported in this browser.");
  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = buffer.getChannelData(0);
    const n = Math.min(1200, Math.max(60, Math.round(buffer.duration * 20)));
    const block = Math.max(1, Math.floor(data.length / n));
    const raw = Array.from({ length: n }, (_, i) => {
      let max = 0;
      for (let j = i * block; j < Math.min(data.length, (i + 1) * block); j += 16) max = Math.max(max, Math.abs(data[j] ?? 0));
      return max;
    });
    const top = Math.max(0.01, ...raw);
    return {
      ...eventTemplate("audio", "Voiceover", start),
      name: file.name,
      source: URL.createObjectURL(file),
      duration: buffer.duration,
      sourceDuration: buffer.duration,
      sourceOffset: 0,
      peaks: raw.map((v) => Math.round((v / top) * 100) / 100),
    };
  } catch {
    throw new Error("This audio file could not be opened. Try MP3, WAV or M4A.");
  } finally {
    void ctx.close();
  }
}

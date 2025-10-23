import { ZoomEffect } from "../types/editor/zoom-effect";

type Overlay =
  | { type: "blur" | "rect"; x: number; y: number; w: number; h: number }
  | { type: "arrow"; x: number; y: number; x2: number; y2: number }
  | { type: "text"; x: number; y: number; text: string };

export const videoTrimmer = async (inputBlob: Blob, start: string, end: string): Promise<Blob> => {
  const { createFFmpeg } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = createFFmpeg({
    log: true,
    corePath: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0",
  });
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }

  const inputName = "input.webm";
  const outputName = "output.webm";

  // Helper to format time as seconds (float)
  function toSeconds(t: string | number): number {
    if (typeof t === "number") {
      return t;
    }
    if (t.includes(":")) {
      // HH:MM:SS[.mmm]
      const parts = t.split(":").map(Number);
      if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      } else {
        return Number(t);
      }
    }
    return parseFloat(t);
  }

  ffmpeg.FS("writeFile", inputName, new Uint8Array(await inputBlob.arrayBuffer()));

  // Get video duration
  let duration = 0;
  // Skipping log parsing for duration due to lack of public API in ffmpeg.wasm
  // Instead, fallback to a large number (should be longer than any real video)
  duration = 999999;

  const startSec = toSeconds(start);
  const endSec = toSeconds(end);

  // Compose filter_complex for trim and concat
  // [0:v]trim=0:start,setpts=PTS-STARTPTS[v0];[0:a]atrim=0:start,asetpts=PTS-STARTPTS[a0];
  // [0:v]trim=end:duration,setpts=PTS-STARTPTS[v1];[0:a]atrim=end:duration,asetpts=PTS-STARTPTS[a1];
  // [v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]
  const filter =
    `[0:v]trim=0:${startSec},setpts=PTS-STARTPTS[v0];` +
    `[0:a]atrim=0:${startSec},asetpts=PTS-STARTPTS[a0];` +
    `[0:v]trim=${endSec}:${duration},setpts=PTS-STARTPTS[v1];` +
    `[0:a]atrim=${endSec}:${duration},asetpts=PTS-STARTPTS[a1];` +
    "[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]";

  try {
    await ffmpeg.run(
      "-i",
      inputName,
      "-filter_complex",
      filter,
      "-map",
      "[outv]",
      "-map",
      "[outa]",
      "-c:v",
      "libvpx",
      "-c:a",
      "libvorbis",
      outputName
    );
  } catch (err) {
    console.error("FFmpeg filter_complex error", err);
    throw new Error("Failed to trim and concatenate video segments");
  }

  try {
    const data = ffmpeg.FS("readFile", outputName);
    return new Blob([data.slice(0).buffer], { type: "video/webm" });
  } catch (e) {
    console.error("FFmpeg output read error", e);
    throw new Error("Output file not found");
  }
};

export const videoToMP4 = async (inputBlob: Blob): Promise<Blob> => {
  const { createFFmpeg } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = createFFmpeg({
    log: true,
    corePath: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0",
  });
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }

  const inputName = "input.webm";
  const outputName = "output.mp4";
  ffmpeg.FS("writeFile", inputName, new Uint8Array(await inputBlob.arrayBuffer()));
  await ffmpeg.run(
    "-i",
    inputName,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-c:a",
    "aac",
    outputName
  );

  const data = ffmpeg.FS("readFile", outputName);
  return new Blob([data.slice(0).buffer], { type: "video/mp4" });
};

export const videoToThumbnail = async (inputBlob: Blob): Promise<Blob> => {
  const { createFFmpeg } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = createFFmpeg({
    log: true,
    corePath: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0",
  });
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }

  const inputName = "input.webm";
  const outputName = "thumbnail.jpg";
  ffmpeg.FS("writeFile", inputName, new Uint8Array(await inputBlob.arrayBuffer()));
  await ffmpeg.run("-i", inputName, "-ss", "00:00:01.000", "-vframes", "1", outputName);

  const data = ffmpeg.FS("readFile", outputName);
  return new Blob([data.slice(0).buffer], { type: "image/jpeg" });
};

export const videoToMP4WithOverlays = async (
  inputBlob: Blob,
  overlays: Overlay[]
): Promise<Blob> => {
  const { createFFmpeg } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = createFFmpeg({
    log: true,
    corePath: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0",
  });
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }

  const inputName = "input.webm";
  const outputName = "output_overlay.mp4";
  ffmpeg.FS("writeFile", inputName, new Uint8Array(await inputBlob.arrayBuffer()));

  const vf = generateFFmpegFilters(overlays);

  await ffmpeg.run(
    "-i",
    inputName,
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-c:a",
    "aac",
    outputName
  );

  const data = ffmpeg.FS("readFile", outputName);
  return new Blob([data.slice(0).buffer], { type: "video/mp4" });
};

export const videoWithZoomEffects = async (
  inputBlob: Blob,
  zoomEffects: ZoomEffect[]
): Promise<Blob> => {
  // Use the enhanced zoom processor
  const { createEnhancedZoomProcessor } = await import("./enhancedZoomProcessor");
  return await createEnhancedZoomProcessor(inputBlob, zoomEffects);
};

function generateFFmpegFilters(overlays: Overlay[]): string {
  return overlays
    .map((o) => {
      switch (o.type) {
        case "blur":
          return `[0:v]crop=w=${o.w}:h=${o.h}:x=${o.x}:y=${o.y},boxblur=10[blurred];[0:v][blurred]overlay=${o.x}:${o.y}`;
        case "rect":
          return `drawbox=x=${o.x}:y=${o.y}:w=${o.w}:h=${o.h}:color=red@0.6:t=2`;
        case "arrow":
          return `drawbox=x=${o.x}:y=${o.y}:w=2:h=2:color=yellow@1.0:t=fill`; // Approximation
        case "text":
          return `drawtext=text='${o.text}':x=${o.x}:y=${o.y}:fontsize=20:fontcolor=white`;
      }
    })
    .join(",");
}

export const videoToMP3 = async (inputBlob: Blob): Promise<Blob> => {
  const { createFFmpeg } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = createFFmpeg({
    log: true,
    corePath: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0",
  });
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }

  const inputName = "input.webm";
  const outputName = "output.mp3";
  ffmpeg.FS("writeFile", inputName, new Uint8Array(await inputBlob.arrayBuffer()));
  await ffmpeg.run("-i", inputName, "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k", outputName);

  const data = ffmpeg.FS("readFile", outputName);
  return new Blob([data.slice(0).buffer], { type: "audio/mp3" });
};

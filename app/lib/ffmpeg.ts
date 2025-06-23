type Overlay =
  | { type: "blur" | "rect"; x: number; y: number; w: number; h: number }
  | { type: "arrow"; x: number; y: number; x2: number; y2: number }
  | { type: "text"; x: number; y: number; text: string };


export const videoTrimmer = async (inputBlob: Blob, start: string, end: string): Promise<Blob> => {
  const { createFFmpeg } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = createFFmpeg({ log: true, corePath: "/ffmpeg/ffmpeg-core.js" });
  if (!ffmpeg.isLoaded()) await ffmpeg.load();

  const inputName = "input.webm";
  const outputName = "output.webm";
  ffmpeg.FS("writeFile", inputName, new Uint8Array(await inputBlob.arrayBuffer()));
  await ffmpeg.run("-i", inputName, "-ss", start, "-to", end, "-c:v", "libvpx", "-c:a", "libvorbis", outputName);

  try {
    const data = ffmpeg.FS("readFile", outputName);
    return new Blob([data.slice(0).buffer], { type: "video/webm" });
  } catch {
    throw new Error("Output file not found");
  }
};

export const videoToMP4 = async (inputBlob: Blob): Promise<Blob> => {
  const { createFFmpeg } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = createFFmpeg({ log: true, corePath: "/ffmpeg/ffmpeg-core.js" });
  if (!ffmpeg.isLoaded()) await ffmpeg.load();

  const inputName = "input.webm";
  const outputName = "output.mp4";
  ffmpeg.FS("writeFile", inputName, new Uint8Array(await inputBlob.arrayBuffer()));
  await ffmpeg.run("-i", inputName, "-c:v", "libx264", "-preset", "fast", "-c:a", "aac", outputName);

  const data = ffmpeg.FS("readFile", outputName);
  return new Blob([data.slice(0).buffer], { type: "video/mp4" });
};

export const videoToThumbnail = async (inputBlob: Blob): Promise<Blob> => {
  const { createFFmpeg } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = createFFmpeg({ log: true, corePath: "/ffmpeg/ffmpeg-core.js" });
  if (!ffmpeg.isLoaded()) await ffmpeg.load();

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
  const ffmpeg = createFFmpeg({ log: true, corePath: "/ffmpeg/ffmpeg-core.js" });
  if (!ffmpeg.isLoaded()) await ffmpeg.load();

  const inputName = "input.webm";
  const outputName = "output_overlay.mp4";
  ffmpeg.FS("writeFile", inputName, new Uint8Array(await inputBlob.arrayBuffer()));

  const vf = generateFFmpegFilters(overlays);

  await ffmpeg.run(
    "-i", inputName,
    "-vf", vf,
    "-c:v", "libx264", "-preset", "fast", "-c:a", "aac",
    outputName
  );

  const data = ffmpeg.FS("readFile", outputName);
  return new Blob([data.slice(0).buffer], { type: "video/mp4" });
};

function generateFFmpegFilters(overlays: Overlay[]): string {
  return overlays.map((o) => {
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
  }).join(",");
}
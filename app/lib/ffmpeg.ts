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

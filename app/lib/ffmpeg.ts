// import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

// export const ffmpeg = createFFmpeg({
//   log: true,
//   corePath: "https://unpkg.com/@ffmpeg/core@0.12.4/dist/ffmpeg-core.js", // adjust if needed
// });

// export const ffmpegLoadedEnsurer = async () => {
//   if (!ffmpeg.isLoaded()) {
//     await ffmpeg.load();
//   }
// };

// export const videoTrimmer = async (inputName, outputName, start, end) => {
//   await ffmpegLoadedEnsurer();
//   await ffmpeg.FS("writeFile", inputName, await fetchFile(`/tmp/${inputName}`));
//   await ffmpeg.run(
//     "-i",
//     inputName,
//     "-ss",
//     start,
//     "-to",
//     end,
//     "-c",
//     "copy",
//     outputName
//   );
//   const data = ffmpeg.FS("readFile", outputName);
//   return new Blob([data.buffer], { type: "video/webm" });
// };

// /**
//  * Note: in dev you can write the raw Blob into /tmp/input.webm via ffmpeg.FS("writeFile", …).
//  * In production you might need to convert the Blob to Uint8Array manually.
//  */

export const videoTrimmer = async (
  inputBlob: Blob,
  start: string,
  end: string
): Promise<Blob> => {
  const ffmpegModule = await import("@ffmpeg/ffmpeg");
  const createFFmpeg = ffmpegModule.createFFmpeg;

  const ffmpeg = createFFmpeg({
    log: true,
    corePath: "/ffmpeg/ffmpeg-core.js",
  });

  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }

  const inputName = "input.webm";
  const outputName = "output.webm";

  const buffer = new Uint8Array(await inputBlob.arrayBuffer());
  ffmpeg.FS("writeFile", inputName, buffer);

  try {
    await ffmpeg.run(
      "-i", inputName,
      "-ss", start,
      "-to", end,
      "-c:v", "libvpx",
      "-c:a", "libvorbis",
      outputName
    );

    const readdir = ffmpeg.FS as unknown as (
    method: "readdir",
    path: string
    ) => string[];

    console.log("FFmpeg FS:", readdir("readdir", "/"));


  } catch (e) {
    console.error("FFmpeg run failed:", e);
    throw new Error("Video trimming failed.");
  }

  try {
    const data = ffmpeg.FS("readFile", outputName);
    const safeBuffer = new Uint8Array(data); // fix SharedArrayBuffer error
    return new Blob([safeBuffer], { type: "video/webm" });
  } catch (e) {
    console.error("Failed to read output file:", e);
    throw new Error("Output file not found.");
  }
};


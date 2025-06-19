// import { createFFmpeg } from "@ffmpeg/ffmpeg";
// import { useCallback, useState } from "react";
// import { videoTrimmer } from "../lib/ffmpeg";
// const ffmpeg = createFFmpeg({
//   log: true,
//   corePath: "https://unpkg.com/@ffmpeg/core@0.12.4/dist/ffmpeg-core.js",
// });

// export const useEditor = (initialUrl: string) => {
//   const [videoUrl, setVideoUrl] = useState(initialUrl);
//   const [processing, setProcessing] = useState(false);

//   const trimApplier = useCallback(
//     async (start: string, end: string) => {
//       setProcessing(true);
//       if (!ffmpeg.isLoaded()) {
//         await ffmpeg.load();
//       }

//       // write the URL blob into ffmpeg FS
//       const blob = await fetch(videoUrl).then((r) => r.blob());
//       const name = "input.webm";
//       await ffmpeg.FS(
//         "writeFile",
//         name,
//         new Uint8Array(await blob.arrayBuffer())
//       );
//       const outputBlob = await videoTrimmer(name, "output.webm", start, end);
//       const newUrl = URL.createObjectURL(outputBlob);
//       setVideoUrl(newUrl);
//       setProcessing(false);
//     },
//     [videoUrl]
//   );
//   return { videoUrl, processing, trimApplier };
// };

import { useCallback, useState } from "react";
import { videoTrimmer } from "../lib/ffmpeg";

export const useEditor = (initialUrl: string) => {
  const [videoUrl, setVideoUrl] = useState(initialUrl);
  const [originalUrl] = useState(initialUrl);
  const [processing, setProcessing] = useState(false);

  const trimApplier = useCallback(
    async (start: string, end: string) => {
      setProcessing(true);

      const blob = await fetch(videoUrl).then((res) => res.blob());
      const trimmedBlob = await videoTrimmer(blob, start, end);
      const newUrl = URL.createObjectURL(trimmedBlob);

      setVideoUrl(newUrl);
      setProcessing(false);
    },
    [videoUrl]
  );

  const resetVideo = () => setVideoUrl(originalUrl);

  return { videoUrl, processing, trimApplier, resetVideo };
};

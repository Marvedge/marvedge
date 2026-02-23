// app/api/trim/route.ts
// This endpoint is no longer used - video trimming is handled client-side using WASM FFmpeg
// See app/lib/ffmpeg.ts for the videoTrimmer function instead

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Video trimming has been moved to client-side processing.   Use the videoTrimmer function from app/lib/ffmpeg.ts instead.",
    },
    { status: 501 }
  );
}

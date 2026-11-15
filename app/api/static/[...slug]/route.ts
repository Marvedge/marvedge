import { NextRequest, NextResponse } from "next/server";
import { join } from "node:path";
import { existsSync, createReadStream } from "node:fs";
import { Readable } from "node:stream";

export async function GET(req: NextRequest) {
  const { pathname } = new URL(req.url);
  // path after /api/static/
  const slug = pathname.replace(/^\/api\/static\//, "");
  const filePath = join(process.cwd(), "public", slug);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const stream = createReadStream(filePath);
  const response = new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=3600",
    },
  });
  return response;
}


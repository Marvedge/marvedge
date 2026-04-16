import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Storage } from "@google-cloud/storage";
import { authOptions } from "@/app/lib/auth/options";

const storage = new Storage();

function parseGsUri(uri: string) {
  if (!uri.startsWith("gs://")) {
    return null;
  }
  const raw = uri.slice("gs://".length);
  const slashIdx = raw.indexOf("/");
  if (slashIdx <= 0) {
    return null;
  }
  const bucket = raw.slice(0, slashIdx);
  const object = raw.slice(slashIdx + 1);
  if (!bucket || !object) {
    return null;
  }
  return { bucket, object };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const inputUrl = (req.nextUrl.searchParams.get("url") || "").trim();
    if (!inputUrl) {
      return NextResponse.json({ ok: false, error: "url is required" }, { status: 400 });
    }

    if (!inputUrl.startsWith("gs://")) {
      return NextResponse.json({ ok: true, playableUrl: inputUrl });
    }

    const parsed = parseGsUri(inputUrl);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "Invalid gs:// URL" }, { status: 400 });
    }

    const [signedUrl] = await storage
      .bucket(parsed.bucket)
      .file(parsed.object)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 2 * 60 * 60 * 1000,
      });

    return NextResponse.json({
      ok: true,
      playableUrl: signedUrl,
      sourceUrl: inputUrl,
    });
  } catch (error) {
    console.error("GCS resolve error:", error);
    return NextResponse.json({ ok: false, error: "Failed to resolve video URL" }, { status: 500 });
  }
}

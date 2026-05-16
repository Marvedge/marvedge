import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Storage } from "@google-cloud/storage";
import { authOptions } from "@/app/lib/auth/options";

function getStorageClient() {
  const projectId = (
    process.env.GOOGLE_CLOUD_PROJECT_ID ||
    process.env.GCP_PROJECT_ID ||
    ""
  ).trim();
  const clientEmail = (process.env.GOOGLE_CLOUD_CLIENT_EMAIL || "").trim();
  const privateKeyRaw = process.env.GOOGLE_CLOUD_PRIVATE_KEY || "";
  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Google Cloud credentials env (GOOGLE_CLOUD_PROJECT_ID, GOOGLE_CLOUD_CLIENT_EMAIL, GOOGLE_CLOUD_PRIVATE_KEY)"
    );
  }

  return new Storage({
    projectId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  });
}

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

    const storage = getStorageClient();
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

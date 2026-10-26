import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { getSignedDownloadUrl, objectExists, parseStorageUri } from "@/app/lib/storage";
import { mayResolveObject } from "@/app/lib/storage/access";

/**
 * GET /api/gcs/resolve?url=<storage-uri>
 *
 * Resolves a private storage URI (s3:// or gs://) to a short-lived signed
 * HTTPS URL that the browser video player can fetch directly.
 *
 * Storage backend: AWS S3 (primary) or GCS (fallback), controlled by
 * STORAGE_PROVIDER env var. Supports both s3:// and gs:// URIs so that
 * legacy GCS references stored in the database continue to resolve.
 *
 * Security: only the authenticated owner may resolve their own objects.
 */

const SOURCE_NOT_FOUND_ERROR = "Source video object not found in storage";

async function getCurrentUserId(sessionUser: {
  id?: string;
  email?: string | null;
}): Promise<string | null> {
  if (sessionUser.id) return sessionUser.id;
  if (!sessionUser.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: sessionUser.email },
    select: { id: true },
  });
  return user?.id ?? null;
}

/**
 * Try the requested object key and fall back to common video extension variants
 * (for legacy .bin uploads that were stored without an extension).
 * Returns the first key that actually exists in storage, or null.
 */
async function firstExistingKey(bucket: string, object: string): Promise<string | null> {
  const candidates = [object];
  if (object.endsWith(".bin")) {
    const base = object.slice(0, -4);
    candidates.push(`${base}.webm`, `${base}.mp4`, `${base}.mov`);
  }
  for (const candidate of candidates) {
    if (await objectExists(bucket, candidate)) return candidate;
  }
  return null;
}

function sourceNotFoundResponse() {
  return NextResponse.json({ ok: false, error: SOURCE_NOT_FOUND_ERROR }, { status: 404 });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getCurrentUserId(session.user);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const inputUrl = (req.nextUrl.searchParams.get("url") || "").trim();
    if (!inputUrl) {
      return NextResponse.json({ ok: false, error: "url is required" }, { status: 400 });
    }

    // If it's already a plain HTTPS URL, return it directly — no signing needed.
    if (!inputUrl.startsWith("s3://") && !inputUrl.startsWith("gs://")) {
      return NextResponse.json({ ok: true, playableUrl: inputUrl });
    }

    const parsed = parseStorageUri(inputUrl);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "Invalid storage URI (expected s3:// or gs://)" },
        { status: 400 }
      );
    }

    const authorized = await mayResolveObject(inputUrl, parsed.bucket, parsed.key, userId);
    if (!authorized) return sourceNotFoundResponse();

    const existingKey = await firstExistingKey(parsed.bucket, parsed.key);
    if (!existingKey) return sourceNotFoundResponse();

    // Generate a 2-hour presigned URL — S3 or GCS per active STORAGE_PROVIDER.
    const playableUrl = await getSignedDownloadUrl(parsed.bucket, existingKey);

    return NextResponse.json({
      ok: true,
      playableUrl,
      // Return canonical URI — callers should update their DB records to s3:// over time.
      sourceUrl: `${inputUrl.startsWith("s3://") ? "s3" : "gs"}://${parsed.bucket}/${existingKey}`,
    });
  } catch (error) {
    console.error("[storage] resolve error:", error);
    return NextResponse.json({ ok: false, error: "Failed to resolve video URL" }, { status: 500 });
  }
}

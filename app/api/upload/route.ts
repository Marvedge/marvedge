import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import cloudinary from "@/app/lib/cloudinary";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import type { UploadApiOptions, UploadApiErrorResponse, UploadApiResponse } from "cloudinary";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// FIX: allow only safe image types including GIF
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

// FIX: sniff real content — file.type is client-controlled and cannot be trusted
function detectImageMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }

  // GIF87a / GIF89a
  const gifHeader = buffer.subarray(0, 6).toString("ascii");
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return "image/gif";
  }

  // WEBP: RIFF....WEBP
  const riff = buffer.subarray(0, 4).toString("ascii");
  const webp = buffer.subarray(8, 12).toString("ascii");
  if (riff === "RIFF" && webp === "WEBP") {
    return "image/webp";
  }

  return null;
}

export async function POST(req: NextRequest) {
  // FIX: block unauthenticated requests
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // FIX: limit to 10 uploads per minute per user
  if (await isRateLimited(`upload:${session.user.id}`, 10, 60)) {
    return NextResponse.json({ error: "Too many uploads (max 10 per minute)" }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const entry = formData.get("file");

    // FIX: FormData can carry a string — validate it is really a File/Blob
    if (!entry || typeof entry === "string" || !(entry instanceof Blob)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const file = entry as File;

    if (typeof file.size !== "number" || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // FIX: reject oversized files before reading
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    // FIX: reject non-image files
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: "Only JPEG, PNG, WEBP or GIF allowed" }, { status: 400 });
    }

    const fileName = typeof file.name === "string" ? file.name : "";
    const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";

    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ error: "Only JPEG, PNG, WEBP or GIF allowed" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // FIX: re-check real byte length
    if (buffer.length > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
    }

    if (buffer.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    // FIX: reject spoofed content
    const detected = detectImageMime(buffer);
    if (!detected || !ALLOWED_MIME.has(detected)) {
      return NextResponse.json({ error: "Invalid image file" }, { status: 400 });
    }

    // FIX: generate safe server-owned asset ID
    const safeUserId = session.user.id.replace(/[^\w-]/g, "_");
    const publicId = `${safeUserId}/${Date.now()}`;

    
    let uploadResult: UploadApiResponse;

    try {
      uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
        const uploadOptions: UploadApiOptions = {
          folder: "profile_pics",
          resource_type: "image",
          public_id: publicId,
          overwrite: false,
        };

        cloudinary.uploader
          .upload_stream(
            uploadOptions,
            (
              error: UploadApiErrorResponse | undefined,
              result: UploadApiResponse | undefined
            ) => {
              if (error || !result?.secure_url) {
                reject(error ?? new Error("Upload failed"));
                return;
              }

              resolve(result);
            }
          )
          .end(buffer);
      });
    } catch (error) {
      console.error("Cloudinary Upload Error:", error);

      const cloudinaryStatus =
        typeof error === "object" &&
        error !== null &&
        "http_code" in error &&
        typeof (error as { http_code?: unknown }).http_code === "number"
          ? (error as { http_code: number }).http_code
          : undefined;

      // Cloudinary rejected the client file itself.
      if (cloudinaryStatus && cloudinaryStatus >= 400 && cloudinaryStatus < 500) {
        return NextResponse.json({ error: "Invalid image file" }, { status: 400 });
      }

      // Network, provider, configuration, or other upstream failure.
      return NextResponse.json(
        { error: "Image upload failed. Please try again." },
        { status: 502 }
      );
    }
    

    // FIX: return minimal fields only — never leak api_key/signature/version_id
    return NextResponse.json({
      secure_url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to upload file";
    console.error("Upload API Error:", err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import cloudinary from "@/app/lib/cloudinary";
import type { UploadApiOptions } from "cloudinary";

const TUTORIAL_SAVE_ERROR = "Failed to save tutorial";
const TUTORIAL_FETCH_ERROR = "Failed to fetch tutorials";

// Mirror the hardened app/api/upload/route.ts caps: tutorial slides are
// Cloudinary uploads with resource_type auto, so without these an attacker
// can push arbitrary counts, sizes, and file types through it.
const MAX_SLIDES = 30;
const MAX_SLIDE_BYTES = 5 * 1024 * 1024; // 5MB decoded per slide
const MAX_TOTAL_SLIDE_BYTES = 5 * 1024 * 1024; // 5MB decoded total

const ALLOWED_SLIDE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Sniff real content — data-URL prefixes and client MIME hints are not trusted.
function detectSlideMime(buffer: Buffer): string | null {
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

interface SlideData {
  title: string;
  description: string;
  imageData: string;
  clicks: Array<{
    x: number;
    y: number;
    timestamp: number;
    elementText?: string;
    elementId?: string;
  }>;
  timestamp: number;
}

interface TutorialPayload {
  title: string;
  description?: string;
  slides: SlideData[];
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as TutorialPayload;
    const { title, description, slides } = body;

    if (!title || !slides || !Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json({ error: "Title and slides are required" }, { status: 400 });
    }

    if (slides.length > MAX_SLIDES) {
      return NextResponse.json(
        { error: `Too many slides (max ${MAX_SLIDES})` },
        { status: 413 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Validate every slide before any upload: decoded size + magic bytes.
    let totalSlideBytes = 0;
    for (const slide of slides) {
      if (!slide || typeof slide.imageData !== "string" || slide.imageData.length === 0) {
        return NextResponse.json({ error: "Invalid slide image" }, { status: 400 });
      }
      let buffer: Buffer;
      try {
        const base64Data = slide.imageData.split(",")[1] || slide.imageData;
        buffer = Buffer.from(base64Data, "base64");
      } catch {
        return NextResponse.json({ error: "Invalid slide image" }, { status: 400 });
      }
      if (buffer.length === 0) {
        return NextResponse.json({ error: "Invalid slide image" }, { status: 400 });
      }
      if (buffer.length > MAX_SLIDE_BYTES) {
        return NextResponse.json({ error: "Slide image too large (max 5MB)" }, { status: 413 });
      }
      totalSlideBytes += buffer.length;
      if (totalSlideBytes > MAX_TOTAL_SLIDE_BYTES) {
        return NextResponse.json({ error: "Slides too large (max 5MB total)" }, { status: 413 });
      }
      const detected = detectSlideMime(buffer);
      if (!detected || !ALLOWED_SLIDE_MIME.has(detected)) {
        return NextResponse.json({ error: "Only JPEG, PNG, WEBP or GIF allowed" }, { status: 400 });
      }
    }

    const uploadedSlides = await Promise.all(
      slides.map(async (slide) => {
        try {
          const base64Data = slide.imageData.split(",")[1] || slide.imageData;
          const buffer = Buffer.from(base64Data, "base64");

          return new Promise<{ imageUrl: string; slide: SlideData }>((resolve, reject) => {
            const uploadOptions: UploadApiOptions = {
              folder: "tutorial_slides",
              resource_type: "image",
              upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET,
            };

            cloudinary.uploader
              .upload_stream(uploadOptions, (error, result) => {
                if (error) {
                  reject(error);
                } else {
                  resolve({
                    imageUrl: result?.secure_url || "",
                    slide,
                  });
                }
              })
              .end(buffer);
          });
        } catch (error) {
          console.error("Error uploading slide:", error);
          throw error;
        }
      })
    );

    const tutorial = await prisma.tutorial.create({
      data: {
        title,
        description: description || null,
        userId: user.id,
        slides: {
          create: uploadedSlides.map(({ imageUrl, slide }) => ({
            title: slide.title,
            description: slide.description,
            imageUrl,
            clicks: slide.clicks,
            timestamp: slide.timestamp,
          })),
        },
      },
      include: {
        slides: true,
      },
    });

    return NextResponse.json(tutorial);
  } catch (err: unknown) {
    // Retain diagnostic details in server logs without exposing Prisma,
    // database or infrastructure information to the client.
    console.error("Tutorial save error:", err);

    return NextResponse.json({ error: TUTORIAL_SAVE_ERROR }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const tutorials = await prisma.tutorial.findMany({
      where: { userId: user.id },
      include: { slides: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(tutorials);
  } catch (err: unknown) {
    // Retain diagnostic details in server logs without exposing Prisma,
    // database or infrastructure information to the client.
    console.error("Tutorial fetch error:", err);

    return NextResponse.json({ error: TUTORIAL_FETCH_ERROR }, { status: 500 });
  }
}

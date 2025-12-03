import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import cloudinary from "@/app/lib/cloudinary";
import type { UploadApiOptions } from "cloudinary";

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

    if (!title || !slides || slides.length === 0) {
      return NextResponse.json({ error: "Title and slides are required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const uploadedSlides = await Promise.all(
      slides.map(async (slide) => {
        try {
          const base64Data = slide.imageData.split(",")[1] || slide.imageData;
          const buffer = Buffer.from(base64Data, "base64");

          return new Promise<{ imageUrl: string; slide: SlideData }>((resolve, reject) => {
            const uploadOptions: UploadApiOptions = {
              folder: "tutorial_slides",
              resource_type: "auto",
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
    const errorMessage = err instanceof Error ? err.message : "Failed to save tutorial";
    console.error("Tutorial save error:", err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
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
    const errorMessage = err instanceof Error ? err.message : "Failed to fetch tutorials";
    console.error("Tutorial fetch error:", err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

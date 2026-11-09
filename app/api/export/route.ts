import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // A broken body is a 400, not a 500.
    let videoUrl: unknown;
    let title: unknown;
    let description: unknown;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const body = parsed as Record<string, unknown>;
      videoUrl = body.videoUrl;
      title = body.title;
      description = body.description;
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!videoUrl) {
      return NextResponse.json({ error: "No video URL provided" }, { status: 400 });
    }

    if (typeof videoUrl !== "string") {
      return NextResponse.json({ error: "No video URL provided" }, { status: 400 });
    }

    // Create preview URL
    const previewUrl = `/preview?video=${encodeURIComponent(videoUrl)}&title=${encodeURIComponent(typeof title === "string" ? title : "")}&description=${encodeURIComponent(typeof description === "string" ? description : "")}`;

    return NextResponse.json({
      success: true,
      cloudinaryUrl: videoUrl,
      previewUrl,
    });
  } catch (err) {
    console.error("Export API Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

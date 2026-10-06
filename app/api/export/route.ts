import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { videoUrl, title, description } = await req.json();

    if (!videoUrl) {
      return NextResponse.json({ error: "No video URL provided" }, { status: 400 });
    }

    // Create preview URL
    const previewUrl = `/preview?video=${encodeURIComponent(videoUrl)}&title=${encodeURIComponent(title || "")}&description=${encodeURIComponent(description || "")}`;

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

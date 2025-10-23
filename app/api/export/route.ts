import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { demoId, exportedVideoId, duration, viewId } = await req.json();

    if (viewId && duration !== undefined) {
      // Update existing view with new duration
      const updatedView = await prisma.view.update({
        where: { id: viewId },
        data: { duration },
      });
      return NextResponse.json({ success: true, viewId: updatedView.id });
    }

    if (!demoId && !exportedVideoId) {
      return NextResponse.json({ error: "Missing demoId or exportedVideoId" }, { status: 400 });
    }

    // Check a simple cookie to prevent spamming views on refresh
    const cookieHeader = req.headers.get("cookie") || "";
    const hasViewedKey = `viewed_${exportedVideoId || demoId}`;
    if (cookieHeader.includes(hasViewedKey) && !viewId) {
       // Return success but don't record a new view (simple deduplication)
       // We'll still return a dummy viewId so the client can "update" it, but we won't actually hit the DB
       return NextResponse.json({ success: true, viewId: "deduped" });
    }

    // Create a new view
    const view = await prisma.view.create({
      data: {
        demoId: demoId || null,
        exportedVideoId: exportedVideoId || null,
        duration: 0,
      },
    });

    const response = NextResponse.json({ success: true, viewId: view.id });
    // Set a cookie that expires in 1 hour
    response.cookies.set(hasViewedKey, "1", { maxAge: 3600, path: "/" });

    return response;
  } catch (error) {
    console.error("Error handling view:", error);
    return NextResponse.json({ error: "Failed to process view" }, { status: 500 });
  }
}

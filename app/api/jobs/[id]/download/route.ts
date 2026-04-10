import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";

function sanitizeFilename(input: string) {
  const cleaned = input
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned || "Exported_Demo";
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const title = req.nextUrl.searchParams.get("title") || "Exported_Demo";

    const job = await prisma.videoJob.findUnique({
      where: { id },
      select: {
        userId: true,
        exportedUrl: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!job.exportedUrl) {
      return NextResponse.json({ error: "No exported URL available" }, { status: 400 });
    }

    const upstream = await fetch(job.exportedUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Failed to fetch exported file (${upstream.status})` },
        { status: 502 }
      );
    }

    const filename = `${sanitizeFilename(title)}.mp4`;
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Job Download Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

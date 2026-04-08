import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";

type Params = { params: Promise<{ id: string }> };

function buildPublicUrl(request: NextRequest, id: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  return `${origin}/share/video/${id}`;
}

async function getOwnedExportedVideo(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const record = await prisma.exportedVideo.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
    select: {
      id: true,
    },
  });

  if (!record) {
    return { error: NextResponse.json({ error: "Exported video not found" }, { status: 404 }) };
  }

  return { record };
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const owned = await getOwnedExportedVideo(id);
  if ("error" in owned) {
    return owned.error;
  }

  return NextResponse.json({
    success: true,
    shareUrl: buildPublicUrl(request, owned.record.id),
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const owned = await getOwnedExportedVideo(id);
  if ("error" in owned) {
    return owned.error;
  }

  return NextResponse.json({
    success: true,
    shareUrl: buildPublicUrl(request, owned.record.id),
  });
}


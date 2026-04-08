import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { NextRequest, NextResponse } from "next/server";
async function resolveOwnedDemo(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const demo = await prisma.demo.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
    select: {
      id: true,
      publicLink: true,
      isPublic: true,
    },
  });

  if (!demo) {
    return { error: NextResponse.json({ error: "Demo not found" }, { status: 404 }) };
  }

  return { demo };
}

function buildPublicUrl(request: NextRequest, slug: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  return `${origin}/share/${slug}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await resolveOwnedDemo(id);
  if ("error" in owned) {
    return owned.error;
  }

  const nextPublicLink = owned.demo.publicLink || id;
  const updated = await prisma.demo.update({
    where: { id },
    data: {
      isPublic: true,
      publicLink: nextPublicLink,
    },
    select: {
      id: true,
      publicLink: true,
      shareCount: true,
    },
  });

  return NextResponse.json({
    success: true,
    publicLink: updated.publicLink,
    shareUrl: buildPublicUrl(request, updated.publicLink || id),
    shareCount: updated.shareCount,
  });
}

// to increase the share count, this will be used
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await resolveOwnedDemo(id);
  if ("error" in owned) {
    return owned.error;
  }

  const nextPublicLink = owned.demo.publicLink || id;
  const updated = await prisma.demo.update({
    where: { id },
    data: {
      isPublic: true,
      publicLink: nextPublicLink,
      shareCount: { increment: 1 },
    },
    select: {
      id: true,
      publicLink: true,
      shareCount: true,
    },
  });

  return NextResponse.json({
    success: true,
    publicLink: updated.publicLink,
    shareUrl: buildPublicUrl(request, updated.publicLink || id),
    shareCount: updated.shareCount,
  });
}

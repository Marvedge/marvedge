import { prisma } from "@/app/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
//to increase the share count , this will be used
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.demo.update({
    where: { id },
    data: { shareCount: { increment: 1 } },
  });

  return NextResponse.json({ success: true });
}

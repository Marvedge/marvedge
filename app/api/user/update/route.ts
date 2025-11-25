import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { firstName, lastName, bio, location, website, image } = body;

  console.log("Update User Request - Image:", image);

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: `${firstName} ${lastName}`.trim(),
        bio,
        location,
        website,
        image: image && image.trim() ? image : null,
      },
    });

    console.log("Updated User Image:", updatedUser.image);
    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("[UPDATE_USER_ERROR]", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

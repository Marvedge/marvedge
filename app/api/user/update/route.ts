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

  // FIX: enforce sane length limits server-side — none existed before,
  // which allowed a 50,000+ character name/bio to be saved with no error.
  const LIMITS = { firstName: 50, lastName: 50, bio: 500, location: 100, website: 200 };

  if (typeof firstName !== "string" || firstName.length > LIMITS.firstName) {
    return NextResponse.json(
      { error: `First name must be under ${LIMITS.firstName} characters` },
      { status: 400 }
    );
  }
  if (typeof lastName !== "string" || lastName.length > LIMITS.lastName) {
    return NextResponse.json(
      { error: `Last name must be under ${LIMITS.lastName} characters` },
      { status: 400 }
    );
  }
  if (bio !== undefined && bio !== null && (typeof bio !== "string" || bio.length > LIMITS.bio)) {
    return NextResponse.json(
      { error: `Bio must be under ${LIMITS.bio} characters` },
      { status: 400 }
    );
  }
  if (
    location !== undefined &&
    location !== null &&
    (typeof location !== "string" || location.length > LIMITS.location)
  ) {
    return NextResponse.json(
      { error: `Location must be under ${LIMITS.location} characters` },
      { status: 400 }
    );
  }
  if (website !== undefined && website !== null && website !== "") {
    if (typeof website !== "string" || website.length > LIMITS.website) {
      return NextResponse.json(
        { error: `Website must be under ${LIMITS.website} characters` },
        { status: 400 }
      );
    }
    try {
      const parsed = new URL(website);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("invalid protocol");
      }
    } catch {
      return NextResponse.json({ error: "Website must be a valid URL" }, { status: 400 });
    }
  }

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

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("[UPDATE_USER_ERROR]", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
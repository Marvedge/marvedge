import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Limit profile writes, closed mode like contact so spam cannot fill the DB.
  if (await isRateLimited(`user-update:${session.user.email}`, 10, 60, true)) {
    return NextResponse.json(
      { error: "Too many requests, please try again shortly" },
      { status: 429 }
    );
  }

  const body = await req.json();
  const { firstName, lastName, bio, location, website, image } = body;

  // Allow partial update, each field is checked only when sent. Names are trimmed.
  const LIMITS = { firstName: 50, lastName: 50, bio: 500, location: 100, website: 200 };

  if (
    firstName !== undefined &&
    firstName !== null &&
    (typeof firstName !== "string" || firstName.trim().length > LIMITS.firstName)
  ) {
    return NextResponse.json(
      { error: `First name must be under ${LIMITS.firstName} characters` },
      { status: 400 }
    );
  }
  if (
    lastName !== undefined &&
    lastName !== null &&
    (typeof lastName !== "string" || lastName.trim().length > LIMITS.lastName)
  ) {
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

  // Image must be a simple http URL when sent.
  if (typeof image === "string" && image.trim().length > 0 && !image.trim().startsWith("http")) {
    return NextResponse.json({ error: "Image must be a valid URL" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Build name from sent parts, keep saved parts for missing ones.
    const parts = (user.name || "").split(" ");
    const baseFirst = parts[0] || "";
    const baseLast = parts.slice(1).join(" ") || "";
    const cleanFirst = typeof firstName === "string" ? firstName.trim() : baseFirst;
    const cleanLast = typeof lastName === "string" ? lastName.trim() : baseLast;
    const nextName = `${cleanFirst} ${cleanLast}`.trim();

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(typeof firstName === "string" || typeof lastName === "string"
          ? { name: nextName }
          : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(location !== undefined ? { location } : {}),
        ...(website !== undefined ? { website } : {}),
        ...(image !== undefined
          ? { image: typeof image === "string" && image.trim() ? image.trim() : null }
          : {}),
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("[UPDATE_USER_ERROR]", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const demos = await prisma.demo.findMany({
      where: { userId: user.id }, // filter by logged-in user
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, demos });
  } catch (error) {
    console.error("Error fetching demos:", error);
    return NextResponse.json(
      { error: "Failed to fetch demos" },
      { status: 500 },
    );
  }
}

//Current session strategy is set to use jwt, entry in the Session table will only be created when set to "database"
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { message: "Demo Id could not be found." },
      { status: 404 },
    );
  }

  try {
    await prisma.demo.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Demo deleted successfully" });
  } catch (error) {
    console.error("Error deleting demo:", error);
    return NextResponse.json(
      { error: "Failed to delete demo" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, description, videoUrl, editing } = await req.json();

    if (!title || !videoUrl) {
      return NextResponse.json(
        { error: "Title, videoUrl are required" },
        { status: 400 },
      );
    }

    // Get logged-in user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const demo = await prisma.demo.create({
      data: {
        title,
        description: description || "",
        videoUrl,
        editing: editing || null,
        userId: user.id, // attach logged-in user
      },
    });

    return NextResponse.json({
      success: true,
      message: "Demo saved successfully!",
      demo,
    });
  } catch (error) {
    console.error("Demo save error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

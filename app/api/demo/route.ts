import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  try {
    console.log("Fetching demos...");

    const demos = await prisma.demo.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log("Demos fetched successfully:", demos.length);

    return NextResponse.json({
      success: true,
      demos,
    });
  } catch (error) {
    console.error("Error fetching demos:", error);
    return NextResponse.json(
      { error: "Failed to fetch demos" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { message: "Demo Id could not be found." },
      { status: 404 }
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
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, description, videoUrl, startTime, endTime, editing } =
      await req.json();

    console.log("Received demo save request:", {
      title,
      description,
      videoUrl,
      startTime,
      endTime,
      editing,
    });

    // Validate required fields
    if (!title || !videoUrl || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Title, videoUrl, startTime, and endTime are required" },
        { status: 400 }
      );
    }

    // Create the demo record with editing object
    const demo = await prisma.demo.create({
      data: {
        title,
        description: description || "",
        videoUrl,
        startTime,
        endTime,
        editing: editing || null, // Store editing as JSON
      },
    });

    console.log("Demo saved successfully:", demo);

    return NextResponse.json({
      success: true,
      message: "Demo saved successfully!",
      demo,
    });
  } catch (error) {
    console.error("Demo save error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

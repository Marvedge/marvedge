import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { revalidatePath } from "next/cache";
import { isSafeUrl } from "@/app/lib/safeUrl";

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
// The editing blob is persisted as JSON and re-broadcast to workers — cap it
// so one oversized save can't fill the row or the downstream payload.
const MAX_EDITING_BYTES = 512 * 1024;

function editingPayloadSize(editing: unknown): number {
  if (editing === undefined || editing === null) {
    return 0;
  }
  try {
    // Byte length, not string length: multibyte characters (e.g. emoji are
    // 4 bytes but 2 UTF-16 code units) must count toward the cap.
    const serialized = JSON.stringify(editing);
    return serialized === undefined ? 0 : Buffer.byteLength(serialized);
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
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
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      // findFirst: { id, userId } is not a unique selector, so findUnique
      // would throw here. id is globally unique, so this matches at most one row.
      const demo = await prisma.demo.findFirst({
        where: { id, userId: user.id },
      });
      return demo
        ? NextResponse.json({ success: true, demo })
        : NextResponse.json({ error: "Demo not found" }, { status: 404 });
    }
    const demos = await prisma.demo.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, demos });
  } catch (error) {
    console.error("Error fetching demos:", error);
    return NextResponse.json({ error: "Failed to fetch demos" }, { status: 500 });
  }
}

//Current session strategy is set to use jwt, entry in the Session table will only be created when set to "database"
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ message: "Demo Id could not be found." }, { status: 400 });
    }

    // Scope the delete to the logged-in user so a demo can only be deleted by its owner.
    const result = await prisma.demo.deleteMany({
      where: { id, userId: session.user.id },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Demo not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Demo deleted successfully" });
  } catch (error) {
    console.error("Error deleting demo:", error);
    return NextResponse.json({ error: "Failed to delete demo" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, description, videoUrl, editing, tags, integrations, userRoles, featured } =
      await req.json();

    if (!title || !videoUrl) {
      return NextResponse.json({ error: "Title, videoUrl are required" }, { status: 400 });
    }

    if (typeof title !== "string" || typeof videoUrl !== "string") {
      return NextResponse.json({ error: "Title and videoUrl must be strings" }, { status: 400 });
    }

    if (title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { error: `Title must be under ${MAX_TITLE_LENGTH} characters` },
        { status: 413 }
      );
    }

    if (typeof description === "string" && description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: `Description must be under ${MAX_DESCRIPTION_LENGTH} characters` },
        { status: 413 }
      );
    }

    // Persisted and later fetched by workers/players — internal addresses stop here.
    if (!isSafeUrl(videoUrl)) {
      return NextResponse.json({ error: "Video URL is not allowed" }, { status: 400 });
    }

    if (editingPayloadSize(editing) > MAX_EDITING_BYTES) {
      return NextResponse.json({ error: "Editing payload is too large" }, { status: 413 });
    }

    const userId = session.user.id as string;

    // Check if a demo with the same title and videoUrl already exists for this user
    const existingDemo = await prisma.demo.findFirst({
      where: {
        userId,
        title,
        videoUrl,
      },
    });

    if (existingDemo) {
      return NextResponse.json(
        {
          success: false,
          message: "Demo with this title and video already exists",
          demo: existingDemo,
        },
        { status: 409 }
      );
    }

    const demo = await prisma.demo.create({
      data: {
        title,
        description: description || "",
        videoUrl,
        editing: editing || null,
        userId, // attach logged-in user
        tags: Array.isArray(tags) ? tags : [],
        integrations: Array.isArray(integrations) ? integrations : [],
        userRoles: Array.isArray(userRoles) ? userRoles : [],
        featured: typeof featured === "boolean" ? featured : false,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Demo saved successfully!",
      demo,
    });
  } catch (error) {
    console.error("Demo save error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      id,
      exportedUrl,
      editing,
      title,
      description,
      tags,
      integrations,
      userRoles,
      featured,
    } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (
      typeof exportedUrl !== "string" &&
      typeof editing === "undefined" &&
      typeof title !== "string" &&
      typeof description !== "string" &&
      !Array.isArray(tags) &&
      !Array.isArray(integrations) &&
      !Array.isArray(userRoles) &&
      typeof featured !== "boolean"
    ) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    if (typeof exportedUrl === "string" && !isSafeUrl(exportedUrl)) {
      return NextResponse.json({ error: "Exported URL is not allowed" }, { status: 400 });
    }

    if (typeof title === "string" && title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { error: `Title must be under ${MAX_TITLE_LENGTH} characters` },
        { status: 413 }
      );
    }

    if (typeof description === "string" && description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: `Description must be under ${MAX_DESCRIPTION_LENGTH} characters` },
        { status: 413 }
      );
    }

    if (editingPayloadSize(editing) > MAX_EDITING_BYTES) {
      return NextResponse.json({ error: "Editing payload is too large" }, { status: 413 });
    }

    // Use a single write to both enforce ownership and avoid extra round trips.
    const updateData: Record<string, unknown> = {
      ...(typeof exportedUrl === "string" ? { exportedUrl } : {}),
      ...(typeof editing !== "undefined" ? { editing } : {}),
      ...(typeof title === "string" ? { title } : {}),
      ...(typeof description === "string" ? { description } : {}),
      ...(Array.isArray(tags) ? { tags } : {}),
      ...(Array.isArray(integrations) ? { integrations } : {}),
      ...(Array.isArray(userRoles) ? { userRoles } : {}),
      ...(typeof featured === "boolean" ? { featured } : {}),
    };

    const result = await prisma.demo.updateMany({
      where: { id, userId: session.user.id },
      data: updateData,
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Demo not found" }, { status: 404 });
    }

    try {
      revalidatePath("/dashboard");
      revalidatePath("/demos");
    } catch (e) {
      console.warn("Revalidation failed:", e);
    }

    return NextResponse.json({ success: true, demo: { id } });
  } catch (error) {
    console.error("Demo PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

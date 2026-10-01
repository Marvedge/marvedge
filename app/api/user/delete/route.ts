import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";

export async function DELETE() {
  const session = await getServerSession(authOptions);

  // Note: delete should require password or recent session check. Generic error if session is missing.
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Retrieve user and their hub settings for Cloudflare cleanup
    const userWithHubSettings = await prisma.user.findFirst({
      where: { email: session.user.email },
      include: { hubSettings: true },
    });

    if (userWithHubSettings?.hubSettings?.cloudflareId) {
      try {
        const { deleteCustomDomain } = await import("@/app/lib/cloudflare");
        await deleteCustomDomain(userWithHubSettings.hubSettings.cloudflareId);
      } catch (cfError) {
        console.error(
          "Failed to delete Cloudflare custom hostname during account deletion:",
          cfError
        );
      }
    }

    // Delete sessions
    await prisma.session.deleteMany({
      where: { user: { email: session.user.email } },
    });

    // Delete accounts
    await prisma.account.deleteMany({
      where: { user: { email: session.user.email } },
    });

    // Delete user
    await prisma.user.delete({
      where: { email: session.user.email },
    });

    return NextResponse.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}

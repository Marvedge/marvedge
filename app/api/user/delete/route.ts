import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
  } catch (error: any) {
    console.error("Error deleting account:", error.message || error);
    return NextResponse.json(
      { error: error.message || "Failed to delete account" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  
  try {
    await prisma.demo.delete({
      where: { id: params.id },
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

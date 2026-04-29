import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rating, content } = await req.json();

    if (!rating || !content) {
      return NextResponse.json({ error: "Missing rating or content" }, { status: 400 });
    }

    const existingReview = await prisma.review.findFirst({
      where: { userId: session.user.id },
    });

    let review;
    if (existingReview) {
      review = await prisma.review.update({
        where: { id: existingReview.id },
        data: { rating, content },
      });
    } else {
      review = await prisma.review.create({
        data: {
          userId: session.user.id,
          rating,
          content,
        },
      });
    }

    return NextResponse.json(review);
  } catch (error) {
    console.error("Failed to create review:", error);
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const reviews = await prisma.review.findMany({
      include: {
        user: {
          select: {
            name: true,
            image: true,
            bio: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(reviews);
  } catch (error) {
    console.error("Failed to fetch reviews:", error);
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}

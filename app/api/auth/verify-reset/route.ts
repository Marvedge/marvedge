import { prisma } from "@/app/lib/prisma";
import { hash, compare } from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email, otp, password, confirmPassword } = await req.json();

    if (!email || !otp || !password || !confirmPassword) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 },
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match." },
        { status: 400 },
      );
    }

    const resetRequest = await prisma.passwordReset.findFirst({
      where: {
        email,
        otp,
      },
    });

    if (!resetRequest) {
      return NextResponse.json(
        { error: "Invalid OTP or email." },
        { status: 400 },
      );
    }

    if (new Date() > resetRequest.expiresAt) {
      return NextResponse.json(
        { error: "OTP expired. Please request again." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const isSamePassword = await compare(password, user.password);
    if (isSamePassword) {
      return NextResponse.json(
        { error: "New password must be different from the old one." },
        { status: 400 },
      );
    }

    const hashedPassword = await hash(password, 10);

    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    await prisma.passwordReset.deleteMany({
      where: { email },
    });

    return NextResponse.json({ message: "Password reset successfully." });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 },
    );
  }
}

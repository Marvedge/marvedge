import { prisma } from "@/app/lib/prisma";
import { hash, compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email: rawEmail, otp, token, password, confirmPassword } = await req.json();
    // Trim spaces so lookup, update, and cleanup use the same address the
    // other reset routes use. Case is left alone so existing accounts keep working.
    const email = typeof rawEmail === "string" ? rawEmail.trim() : rawEmail;
    const resetToken = token || otp;

    if (!email || !resetToken || !password || !confirmPassword) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }
    if (password.length > 72) {
      return NextResponse.json({ error: "Password is too long." }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }

    // same guessing budget as the legacy reset route
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded
      ? forwarded.split(",")[0].trim()
      : req.headers.get("x-real-ip")?.trim() || "unknown";
    if (await isRateLimited(`verify-reset:${ip}:${String(email).toLowerCase()}`, 5, 900)) {
      return NextResponse.json(
        { error: "Too many attempts, please try again later." },
        { status: 429 }
      );
    }

    // Reject absurd input before hashing so huge bodies cannot burn CPU.
    if (typeof resetToken !== "string" || resetToken.length < 4 || resetToken.length > 256) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }

    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    const resetRequest = await prisma.passwordReset.findFirst({
      where: {
        email,
        otp: resetTokenHash,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetRequest) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }

    if (new Date() > resetRequest.expiresAt) {
      return NextResponse.json(
        { error: "Reset link expired. Please request again." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }

    const isSamePassword = await compare(password, user.password);
    if (isSamePassword) {
      return NextResponse.json(
        { error: "New password must be different from the old one." },
        { status: 400 }
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
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

import { prisma } from "@/app/lib/prisma";
import { hash, compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { isPasswordResetRateLimited } from "@/app/lib/auth/passwordResetProtection";
import { readBoundedRequestJsonObject } from "@/app/lib/http/boundedBody";
import crypto from "crypto";

const MAX_AUTH_BODY_BYTES = 8 * 1024;

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const bodyResult = await readBoundedRequestJsonObject(req, MAX_AUTH_BODY_BYTES);

    if (!bodyResult.ok) {
      return NextResponse.json(
        {
          error:
            bodyResult.reason === "too_large" ? "Request body too large" : "Invalid request body.",
        },
        {
          status: bodyResult.reason === "too_large" ? 413 : 400,
        }
      );
    }

    const { email: rawEmail, otp, token, password, confirmPassword } = bodyResult.value;

    // Trim spaces so lookup, update, and cleanup use the same address the
    // other reset routes use. Case is left alone so existing accounts keep working.
    const email = typeof rawEmail === "string" ? rawEmail.trim() : "";

    const resetToken = typeof token === "string" ? token : typeof otp === "string" ? otp : "";

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
    if (await isPasswordResetRateLimited(email, req.headers, "reset-attempt")) {
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

    const resetCompleted = await prisma.$transaction(async (tx) => {
      const consumedReset = await tx.passwordReset.deleteMany({
        where: {
          id: resetRequest.id,
          email,
          otp: resetTokenHash,
          expiresAt: { gt: new Date() },
        },
      });

      if (consumedReset.count !== 1) {
        return false;
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          sessionVersion: { increment: 1 },
        },
      });

      await tx.passwordReset.deleteMany({
        where: { email },
      });

      return true;
    });

    if (!resetCompleted) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }

    return NextResponse.json({ message: "Password reset successfully." });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

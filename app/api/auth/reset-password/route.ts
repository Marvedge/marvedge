import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isPasswordResetRateLimited } from "@/app/lib/auth/passwordResetProtection";
import { readBoundedRequestJsonObject } from "@/app/lib/http/boundedBody";
import crypto from "crypto";

const MAX_AUTH_BODY_BYTES = 8 * 1024;

export const runtime = "nodejs";

export async function POST(req: Request) {
  const bodyResult = await readBoundedRequestJsonObject(req, MAX_AUTH_BODY_BYTES);

  if (!bodyResult.ok) {
    return NextResponse.json(
      {
        error:
          bodyResult.reason === "too_large"
            ? "Request body too large"
            : "Email and OTP are required",
      },
      {
        status: bodyResult.reason === "too_large" ? 413 : 400,
      }
    );
  }

  const body = bodyResult.value;
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const otp = typeof body?.otp === "string" ? body.otp : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!email || !otp) {
    return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });
  }

  // slow down guessing: 5 tries per 15 minutes per ip and email
  if (await isPasswordResetRateLimited(email, req.headers, "reset-attempt")) {
    return NextResponse.json(
      { error: "Too many attempts, please try again later" },
      { status: 429 }
    );
  }

  // Reject absurd input before hashing so huge bodies cannot burn CPU.
  if (otp.length < 4 || otp.length > 10) {
    return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
  }

  // keep weak and absurd inputs out before touching crypto
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (newPassword.length > 72) {
    return NextResponse.json({ error: "Password is too long" }, { status: 400 });
  }

  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

  const resetRequest = await prisma.passwordReset.findFirst({
    where: {
      email,
      otp: otpHash,
      expiresAt: { gt: new Date() },
    },
  });

  if (!resetRequest) {
    return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
  }

  // Check the account still exists before update so a stale code cannot throw.
  const account = await prisma.user.findUnique({ where: { email } });
  if (!account) {
    return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const resetCompleted = await prisma.$transaction(async (tx) => {
    const consumedReset = await tx.passwordReset.deleteMany({
      where: {
        id: resetRequest.id,
        email,
        otp: otpHash,
        expiresAt: { gt: new Date() },
      },
    });

    if (consumedReset.count !== 1) {
      return false;
    }

    await tx.user.update({
      where: { id: account.id },
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
    return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
  }

  return NextResponse.json({ message: "Password has been reset" });
}

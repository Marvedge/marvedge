import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
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

  if (!email || !otp) {
    return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });
  }

  // same guessing budget as the reset itself
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

  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

  const valid = await prisma.passwordReset.findFirst({
    where: {
      email,
      otp: otpHash,
      expiresAt: { gt: new Date() }, // not expired
    },
  });

  if (!valid) {
    return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
  }

  // Remove the row after use so the same code cannot be replayed.
  await prisma.passwordReset.delete({ where: { id: valid.id } });

  return NextResponse.json({ message: "OTP verified" });
}

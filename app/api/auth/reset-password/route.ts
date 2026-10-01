import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isRateLimited } from "@/app/lib/audio/rateLimit";

export const runtime = "nodejs";

function clientKey(req: Request, email: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : req.headers.get("x-real-ip")?.trim() || "unknown";
  return `reset-password:${ip}:${email.toLowerCase()}`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const otp = typeof body?.otp === "string" ? body.otp : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!email || !otp) {
    return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });
  }

  // slow down guessing: 5 tries per 15 minutes per ip and email
  if (await isRateLimited(clientKey(req, email), 5, 900)) {
    return NextResponse.json(
      { error: "Too many attempts, please try again later" },
      { status: 429 }
    );
  }

  // keep weak and absurd inputs out before touching crypto
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (newPassword.length > 72) {
    return NextResponse.json({ error: "Password is too long" }, { status: 400 });
  }

  const resetRequest = await prisma.passwordReset.findFirst({
    where: {
      email,
      otp,
      expiresAt: { gt: new Date() },
    },
  });

  if (!resetRequest) {
    return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { email },
    data: { password: hashedPassword },
  });

  await prisma.passwordReset.deleteMany({ where: { email } }); // cleanup

  return NextResponse.json({ message: "Password has been reset" });
}

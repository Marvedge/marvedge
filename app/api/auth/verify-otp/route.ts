import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import { isRateLimited } from "@/app/lib/audio/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const otp = typeof body?.otp === "string" ? body.otp : "";

  if (!email || !otp) {
    return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });
  }

  // same guessing budget as the reset itself
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : req.headers.get("x-real-ip")?.trim() || "unknown";
  if (await isRateLimited(`verify-otp:${ip}:${email.toLowerCase()}`, 5, 900)) {
    return NextResponse.json(
      { error: "Too many attempts, please try again later" },
      { status: 429 }
    );
  }

  const valid = await prisma.passwordReset.findFirst({
    where: {
      email,
      otp,
      expiresAt: { gt: new Date() }, // not expired
    },
  });

  if (!valid) {
    return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
  }

  return NextResponse.json({ message: "OTP verified" });
}

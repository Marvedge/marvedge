import { prisma } from "@/app/lib/prisma";
import { authOptions } from "@/app/lib/auth/options";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import crypto from "crypto";
import { isRateLimited } from "@/app/lib/audio/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let email = typeof body?.email === "string" ? body.email.trim() : "";
    const authenticatedOnly = Boolean(body?.authenticatedOnly);

    if (!email) {
      const session = await getServerSession(authOptions);
      if (session?.user?.email) {
        email = session.user.email;
      }
    }

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // keep inbox spam and guessing cheap: 5 sends per 15 minutes
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded
      ? forwarded.split(",")[0].trim()
      : req.headers.get("x-real-ip")?.trim() || "unknown";
    if (await isRateLimited(`request-reset:${ip}:${email.toLowerCase()}`, 5, 900)) {
      return NextResponse.json(
        { error: "Too many attempts, please try again later" },
        { status: 429 }
      );
    }

    // Check for Resend API key early
    if (!process.env.RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY");
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    // reply the same whether or not the account exists, so the
    // response never confirms which emails are registered
    if (!user) {
      return NextResponse.json(
        { message: "Password reset link sent to your email." },
        { status: 200 }
      );
    }

    // Optional: block users without passwords (OAuth accounts)
    if (!user.password) {
      return NextResponse.json(
        { message: "Password reset link sent to your email." },
        { status: 200 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save token in existing PasswordReset.otp field to avoid schema migration.
    await prisma.passwordReset.create({
      data: {
        email,
        otp: token,
        expiresAt,
      },
    });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const resetLink = `${appUrl}/auth/reset-password?email=${encodeURIComponent(
      email
    )}&token=${encodeURIComponent(token)}`;

    // Send Email
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!, // use verified domain in production
      to: email,
      subject: "Reset your password",
      html: `
        <p>We received a request to reset your password.</p>
        <p><a href="${resetLink}" target="_blank" rel="noopener noreferrer">Click here to reset your password</a></p>
        <p>This link expires in 15 minutes.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
      `,
    });

    console.log("Resend email result:", result);

    // Optional: Check for delivery failure
    if (result.error) {
      console.error("Email send error:", result.error);
      return NextResponse.json({ error: "Failed to send OTP email" }, { status: 500 });
    }

    return NextResponse.json({
      message: authenticatedOnly
        ? "Password reset link sent to your email."
        : "Password reset link sent to your email.",
    });
  } catch (err) {
    console.error("Unexpected error in password reset handler:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

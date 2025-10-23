import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    console.log("Received email:", email);

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check for Resend API key early
    if (!process.env.RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY");
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "No user found with this email" },
        { status: 404 }
      );
    }

    // Optional: block users without passwords (OAuth accounts)
    if (!user.password) {
      return NextResponse.json(
        { error: "This account does not support password reset" },
        { status: 400 }
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save OTP to DB
    await prisma.passwordReset.create({
      data: {
        email,
        otp,
        expiresAt,
      },
    });
    console.log("OTP saved to DB:", otp);

    const resend = new Resend(process.env.RESEND_API_KEY);
    // const resend = new Resend('re_Hn8AAG3Z_Le8pkEpF9GrqrqP68YSgEevt');

    // Send Email
    const result = await resend.emails.send({
      from: "no-reply@mail.marvedge.com", // use verified domain in production
      to: email,
      subject: "Password Reset OTP",
      html: `<p>Your OTP is <strong>${otp}</strong>. It will expire in 15 minutes.</p>`,
    });

    console.log("Resend email result:", result);

    // Optional: Check for delivery failure
    if (result.error) {
      console.error("Email send error:", result.error);
      return NextResponse.json(
        { error: "Failed to send OTP email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "OTP sent to your email" });
  } catch (err) {
    console.error("Unexpected error in password reset handler:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

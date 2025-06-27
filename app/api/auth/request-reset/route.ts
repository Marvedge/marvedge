import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json(
      { error: "No user found with this email" },
      { status: 404 }
    );
  }

  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // Store OTP in VerificationToken table
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: otp,
      expires,
    },
  });

  // Send OTP via email (mocked for now)
  try {
    // If nodemailer is not set up, just log the OTP
    // Remove/comment this block and use real transporter in production
    console.log(`OTP for ${email}: ${otp}`);
    // Uncomment and configure below for real email sending
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Password Reset OTP",
      text: `Your OTP for password reset is: ${otp}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send OTP email" },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "OTP sent to your email" });
}

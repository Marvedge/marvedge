import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import { Resend } from "resend";

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

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  //const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  const resend = new Resend(process.env.RESEND_API_KEY);
  resend.emails.send({
    from: "no-reply@mail.marvedge.com",
    to: email,
    subject: "Hello World",
    html: `<p>Congrats on sending your <strong>first otp</strong>! OTP=${otp}</p>`,
  });

  return NextResponse.json({ message: "OTP sent to your email" });
}

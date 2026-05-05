import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  try {
    const { name, email, message, company, productUrl } = await req.json();

    const normalizedMessage =
      typeof message === "string" && message.trim().length > 0
        ? message.trim()
        : [
            `Company: ${company || "Not provided"}`,
            `Product URL: ${productUrl || "Not provided"}`,
          ].join("\n");

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    await prisma.contactMessage.create({
      data: {
        name,
        email,
        message: normalizedMessage,
      },
    });

    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      return NextResponse.json(
        {
          success: true,
          message:
            "Saved request, but email service is not configured (missing RESEND_API_KEY or RESEND_FROM_EMAIL).",
        },
        { status: 200 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const destinationEmail = process.env.DEMO_REQUEST_TO_EMAIL || "hey@marvedge.com";

    const sendResult = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: destinationEmail,
      subject: `New demo request from ${name}`,
      html: `
        <h2>New Demo Booking Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Company:</strong> ${company || "Not provided"}</p>
        <p><strong>Product URL:</strong> ${productUrl || "Not provided"}</p>
        <p><strong>Message:</strong><br/>${normalizedMessage.replace(/\n/g, "<br/>")}</p>
      `,
    });

    if (sendResult.error) {
      console.error("Contact email send error:", sendResult.error);
      return NextResponse.json(
        { success: false, error: "Request saved, but failed to send email notification." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Message sent successfully.",
    });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

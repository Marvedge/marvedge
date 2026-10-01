import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { Resend } from "resend";

export const runtime = "nodejs";

// escape user input before putting it into the notification email
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  // slow down bots hammering this public endpoint
  if (await isRateLimited(`contact:${clientIp(req)}`, 3, 60)) {
    return NextResponse.json(
      { error: "Too many requests, please try again shortly" },
      { status: 429 }
    );
  }

  try {
    const { name, email, message, company, productUrl, turnstileToken } = await req.json();

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    // keep inputs within sane bounds
    if (
      (typeof name === "string" && name.length > 100) ||
      (typeof email === "string" && email.length > 255) ||
      (typeof company === "string" && company.length > 100) ||
      (typeof message === "string" && message.length > 5000)
    ) {
      return NextResponse.json({ error: "One or more fields are too long" }, { status: 400 });
    }

    // verify captcha when the client sends one and we can check it
    if (
      typeof turnstileToken === "string" &&
      turnstileToken.length > 0 &&
      process.env.TURNSTILE_SECRET_KEY
    ) {
      try {
        const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: process.env.TURNSTILE_SECRET_KEY,
            response: turnstileToken,
          }),
        });
        const verifyData = (await verifyRes.json().catch(() => null)) as {
          success?: boolean;
        } | null;
        if (!verifyData?.success) {
          return NextResponse.json(
            { error: "Captcha check failed, please try again" },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Captcha check failed, please try again" },
          { status: 400 }
        );
      }
    }

    const normalizedMessage =
      typeof message === "string" && message.trim().length > 0
        ? message.trim()
        : [
            `Company: ${company || "Not provided"}`,
            `Product URL: ${productUrl || "Not provided"}`,
          ].join("\n");

    // escape everything the user typed before it goes into the html email
    const safeName = escapeHtml(String(name));
    const safeEmail = escapeHtml(String(email));
    const safeCompany = escapeHtml(
      typeof company === "string" && company.trim().length > 0 ? company : "Not provided"
    );
    const safeProductUrl = escapeHtml(
      typeof productUrl === "string" && productUrl.trim().length > 0 ? productUrl : "Not provided"
    );
    const safeMessage = escapeHtml(normalizedMessage);

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
      subject: `New demo request from ${safeName}`,
      html: `
        <h2>New Demo Booking Request</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Company:</strong> ${safeCompany}</p>
        <p><strong>Product URL:</strong> ${safeProductUrl}</p>
        <p><strong>Message:</strong><br/>${safeMessage.replace(/\n/g, "<br/>")}</p>
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

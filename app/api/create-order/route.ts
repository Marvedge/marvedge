import Razorpay from "razorpay";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { PAYMENT_CURRENCY, PLANS, isPlanId } from "@/app/lib/plans";
import { isRateLimited } from "@/app/lib/audio/rateLimit";

export const runtime = "nodejs";

// Best effort client IP for rate limiting. Uses proxy headers when present.
function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { plan } = await req.json();
    // Accept only known plan ids. Amount always comes from PLANS below.
    if (!isPlanId(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Slow down order spam. Same budget as contact: 3 per 60, closed mode
    // so a down Redis still blocks instead of letting orders through.
    if (
      await isRateLimited(
        `create-order:${clientIp(req)}:${session.user.email.toLowerCase()}`,
        3,
        60,
        true
      )
    ) {
      return NextResponse.json(
        { error: "Too many requests, please try again shortly" },
        { status: 429 }
      );
    }

    if (!process.env.RAZORPAY_KEY_SECRET || !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
      return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });
    }

    const { amount } = PLANS[plan];

    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID as string,
      key_secret: process.env.RAZORPAY_KEY_SECRET as string,
    });

    const order = await razorpay.orders.create({
      // Amount comes from server PLANS only, never from the client.
      // Email note binds the order to the buyer for verify-payment.
      amount: amount * 100, // In cents (e.g. 4900 cents = 49 USD)
      currency: PAYMENT_CURRENCY,
      receipt: `receipt_${plan}_${Date.now()}`,
      notes: { plan, email: session.user.email },
    });
    return NextResponse.json(order);
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}

import { createHash } from "node:crypto";
import Razorpay from "razorpay";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { PAYMENT_CURRENCY, PLANS, isPlanId } from "@/app/lib/plans";
import { isRateLimited } from "@/app/lib/audio/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Broken JSON should read as a bad request, not a 500.
    let plan: unknown;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      plan = (parsed as Record<string, unknown>).plan;
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Accept only known plan ids. Amount always comes from PLANS below.
    if (!isPlanId(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // One account retains the same budget across different IP addresses.
    // Hash the normalized email so Redis keys do not contain the raw address.
    const accountKey = createHash("sha256")
      .update(session.user.email.trim().toLowerCase())
      .digest("hex");

    if (await isRateLimited(`create-order:account:${accountKey}`, 3, 60, true)) {
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
      amount: amount * 100,
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

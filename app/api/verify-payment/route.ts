import { NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
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

// No new table allowed, so verified order ids cannot be stored in the DB.
// This per instance set only softens replays on one server. The rate limit
// below and the idempotent skip when the user is already on plan carry
// the rest. It is capped to avoid growth without bound.
const seenOrders = new Set<string>();

function signaturesMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Slow down replay attempts. Open mode so checkout still works when Redis is down.
    if (
      await isRateLimited(
        `verify-payment:${clientIp(req)}:${session.user.email.toLowerCase()}`,
        5,
        900
      )
    ) {
      return NextResponse.json(
        { success: false, message: "Too many attempts, please try again later" },
        { status: 429 }
      );
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    if (
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string" ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return NextResponse.json(
        { success: false, message: "Missing payment fields" },
        { status: 400 }
      );
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    if (!process.env.RAZORPAY_KEY_SECRET || !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
      return NextResponse.json(
        { success: false, message: "Payments are not configured" },
        { status: 503 }
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    const isAuthentic = signaturesMatch(expectedSignature, razorpay_signature);

    if (!isAuthentic) {
      return NextResponse.json(
        { success: false, message: "Invalid payment signature" },
        { status: 400 }
      );
    }

    // The signature only proves the order/payment pair is genuine, it says
    // nothing about how much was paid. Re-fetch the order from Razorpay and
    // assert it matches the server defined price for the plan in its notes.
    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID as string,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const order = await razorpay.orders.fetch(razorpay_order_id);
    const orderPlan = typeof order.notes?.plan === "string" ? order.notes.plan : undefined;
    if (!isPlanId(orderPlan)) {
      return NextResponse.json(
        { success: false, message: "Payment does not match a known plan" },
        { status: 400 }
      );
    }
    const expectedAmount = PLANS[orderPlan].amount * 100;
    const orderAmount = Number(order.amount);

    const isValidOrder =
      order.status === "paid" &&
      order.currency === PAYMENT_CURRENCY &&
      orderAmount === expectedAmount &&
      order.notes?.plan === PLANS[orderPlan].id;

    if (!isValidOrder) {
      return NextResponse.json(
        { success: false, message: "Payment does not match the plan" },
        { status: 400 }
      );
    }

    // Fail closed unless Razorpay confirms that this order was created for the
    // currently authenticated account. A valid signature proves the payment
    // tuple is genuine, but does not by itself establish account ownership.
    const orderEmail = typeof order.notes?.email === "string" ? order.notes.email.trim() : "";
    const sessionEmail = session.user.email.trim();

    if (!orderEmail || orderEmail.toLowerCase() !== sessionEmail.toLowerCase()) {
      return NextResponse.json(
        { success: false, message: "Order does not belong to this account" },
        { status: 403 }
      );
    }

    // Update user's plan. The where clause uses the session email as is.
    // Lowercase is used only for the compare above, never for the DB write.
    // Idempotent skip: without a payment table the same order id can be
    // posted again, so if the user is already on the paid plan, return
    // success without another write.
    const targetPlan = orderPlan.toUpperCase();
    const existing = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { plan: true },
    });
    if (existing?.plan === targetPlan) {
      if (seenOrders.size > 5000) {
        seenOrders.clear();
      }
      seenOrders.add(razorpay_order_id);
      return NextResponse.json({
        success: true,
        message: "Payment verified successfully",
      });
    }
    await prisma.user.update({
      where: { email: session.user.email },
      data: { plan: targetPlan },
    });
    if (seenOrders.size > 5000) {
      seenOrders.clear();
    }
    seenOrders.add(razorpay_order_id);
    return NextResponse.json({
      success: true,
      message: "Payment verified successfully",
    });
  } catch (error) {
    console.error("Payment verification failed:", error);
    return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
  }
}

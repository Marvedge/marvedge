import { NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { PAYMENT_CURRENCY, PLANS, isPlanId } from "@/app/lib/plans";
import { isRateLimited } from "@/app/lib/audio/rateLimit";

export const runtime = "nodejs";

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

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

    // Preserve checkout availability when Redis is unavailable.
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

    let razorpay_order_id: unknown;
    let razorpay_payment_id: unknown;
    let razorpay_signature: unknown;

    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json(
          { success: false, message: "Missing payment fields" },
          { status: 400 }
        );
      }
      const body = parsed as Record<string, unknown>;
      razorpay_order_id = body.razorpay_order_id;
      razorpay_payment_id = body.razorpay_payment_id;
      razorpay_signature = body.razorpay_signature;
    } catch {
      return NextResponse.json(
        { success: false, message: "Missing payment fields" },
        { status: 400 }
      );
    }

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

    if (!process.env.RAZORPAY_KEY_SECRET || !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
      return NextResponse.json(
        { success: false, message: "Payments are not configured" },
        { status: 503 }
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (!signaturesMatch(expectedSignature, razorpay_signature)) {
      return NextResponse.json(
        { success: false, message: "Invalid payment signature" },
        { status: 400 }
      );
    }

    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
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
    const isValidOrder =
      order.status === "paid" &&
      order.currency === PAYMENT_CURRENCY &&
      Number(order.amount) === expectedAmount &&
      order.notes?.plan === PLANS[orderPlan].id;

    if (!isValidOrder) {
      return NextResponse.json(
        { success: false, message: "Payment does not match the plan" },
        { status: 400 }
      );
    }

    const orderEmail = typeof order.notes?.email === "string" ? order.notes.email.trim() : "";
    const sessionEmail = session.user.email.trim();

    if (!orderEmail || orderEmail.toLowerCase() !== sessionEmail.toLowerCase()) {
      return NextResponse.json(
        { success: false, message: "Order does not belong to this account" },
        { status: 403 }
      );
    }

    // Orders remain paid after a refund. Verify the payment itself before
    // granting access, including when the user already has the target plan.
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    const isValidPayment =
      payment.id === razorpay_payment_id &&
      payment.order_id === razorpay_order_id &&
      payment.status === "captured" &&
      payment.captured === true &&
      payment.currency === PAYMENT_CURRENCY &&
      Number(payment.amount) === expectedAmount &&
      payment.amount_refunded === 0 &&
      payment.refund_status === null;

    if (!isValidPayment) {
      return NextResponse.json(
        { success: false, message: "Payment is not eligible for this upgrade" },
        { status: 400 }
      );
    }

    const targetPlan = orderPlan.toUpperCase();
    const existing = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { plan: true },
    });

    if (existing?.plan !== targetPlan) {
      await prisma.user.update({
        where: { email: session.user.email },
        data: { plan: targetPlan },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Payment verified successfully",
    });
  } catch (error) {
    console.error("Payment verification failed:", error);
    return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
  }
}

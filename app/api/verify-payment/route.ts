import { NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { PAYMENT_CURRENCY, PLANS } from "@/app/lib/plans";

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

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body.toString())
      .digest("hex");

    const isAuthentic = signaturesMatch(expectedSignature, razorpay_signature);

    if (!isAuthentic) {
      return NextResponse.json(
        { success: false, message: "Invalid payment signature" },
        { status: 400 }
      );
    }

    // The signature only proves the order/payment pair is genuine — it says
    // nothing about how much was paid. Re-fetch the order from Razorpay and
    // assert it matches the server-defined PRO price before upgrading.
    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID as string,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const order = await razorpay.orders.fetch(razorpay_order_id);
    const expectedAmount = PLANS.pro.amount * 100;
    const orderAmount = Number(order.amount);

    const isValidOrder =
      order.status === "paid" &&
      order.currency === PAYMENT_CURRENCY &&
      orderAmount === expectedAmount &&
      order.notes?.plan === PLANS.pro.id;

    if (!isValidOrder) {
      return NextResponse.json(
        { success: false, message: "Payment does not match the PRO plan" },
        { status: 400 }
      );
    }

    // Bind the order to the buyer. Orders created before this fix carry no
    // email note, so only enforce when the note is present. New orders always
    // carry it (see create-order), which stops one payment upgrading many accounts.
    const orderEmail = typeof order.notes?.email === "string" ? order.notes.email : undefined;
    if (orderEmail && orderEmail.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json(
        { success: false, message: "Order does not belong to this account" },
        { status: 403 }
      );
    }

    // Update user's plan to PRO
    await prisma.user.update({
      where: { email: session.user.email },
      data: { plan: "PRO" },
    });
    return NextResponse.json({
      success: true,
      message: "Payment verified successfully",
    });
  } catch (error) {
    console.error("Payment verification failed:", error);
    return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
  }
}

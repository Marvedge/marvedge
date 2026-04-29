import Razorpay from "razorpay";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID as string,
      key_secret: process.env.RAZORPAY_KEY_SECRET as string,
    });

    const { amount } = await req.json();
    const order = await razorpay.orders.create({
      amount: amount * 100, // In cents (e.g. 4900 cents = 49 USD)
      currency: "USD",
      receipt: "receipt_order_7",
    });
    return NextResponse.json(order);
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}

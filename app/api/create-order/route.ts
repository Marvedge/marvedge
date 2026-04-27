import Razorpay from "razorpay";
import { NextResponse } from "next/server";

const razorpay = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  const { amount } = await req.json();
  const order = await razorpay.orders.create({
    amount: amount * 100, // In cents (e.g. 4900 cents = 49 USD)
    currency: "USD",
    receipt: "receipt_order_7",
  });
  return NextResponse.json(order);
}

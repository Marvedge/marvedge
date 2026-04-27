"use client";
import { useState, useEffect, Suspense } from "react";
import Script from "next/script";
import { useSearchParams } from "next/navigation";

function PaymentGatewayContent() {
    const searchParams = useSearchParams();
    const [amount, setAmount] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        const amt = searchParams.get("amount");
        if (amt) {
            setAmount(Number(amt));
        }
    }, [searchParams]);

    const handlePayment = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/create-order", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ amount }),
            });
            const data = await res.json();
            console.log("Order Data:", data);

        const paymentData = {
            key : process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
            order_id : data.id,
            amount : data.amount,
            currency : data.currency,
            name : "Marvedge",
            description : "Payment for Marvedge",
            // image : "/logo.png", // Removing this. Relative paths inside Razorpay iframe often cause 'chrome-error://chromewebdata'

            handler : async function (response : any) {
                console.log(response);
                //we are going to verify the payment
                alert("Payment Successful: " + response.razorpay_payment_id);
            },
        }

        const payment = new (window as any).Razorpay(paymentData);
        payment.open();
        } catch (error) {
            console.error("Payment failed to initialize", error);
            alert("Failed to open payment gateway. Please try again.");
        } finally {
            setLoading(false);
        }
    };
    return (
        <div>
            <h1>Payment Gateway</h1>
            <Script type='text/javascript' src={"https://checkout.razorpay.com/v1/checkout.js"} />
            <div className="flex flex-col gap-4 mt-8">
                {amount > 0 && (
                    <div className="text-lg font-medium text-gray-800">
                        Total Amount: <span className="text-blue-600 font-bold">${amount}</span>
                    </div>
                )}
                <button 
                    onClick={handlePayment} 
                    disabled={amount <= 0 || loading}
                    className="bg-[#8C5BFF] text-white px-6 py-3 rounded-md max-w-xs hover:bg-[#7a4fcf] font-semibold transition-colors disabled:opacity-50 mt-4 mx-auto"
                >
                    {loading ? "Processing..." : `Pay $${amount}`}
                </button>
            </div>
        </div>
    );
}

export default function PaymentGateway() {
    return (
        <Suspense fallback={<div>Loading payment gateway...</div>}>
            <PaymentGatewayContent />
        </Suspense>
    );
}
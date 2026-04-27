"use client";

import React, { useRef, useState } from "react";
import { motion, useInView, easeOut } from "framer-motion";
import { Check } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Script from "next/script";
import { toast } from "react-hot-toast";

const Pricing: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-50px" });
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const [loading, setLoading] = useState(false);

  const pathname = usePathname();

  const handleAuthRedirect = async (amount: number, plan: string) => {
    if (amount === 0) {
      router.push("/dashboard");
      return;
    }

    if (status !== "authenticated") {
      toast.error("Please login first to subscribe.");
      router.push("/api/auth/signin?callbackUrl=" + encodeURIComponent(window.location.href));
      return;
    }

    setLoading(true);
    try {
        const res = await fetch("/api/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount }),
        });
        const data = await res.json();

        const paymentData = {
            key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
            order_id: data.id,
            amount: data.amount,
            currency: data.currency,
            name: "Marvedge",
            description: `Payment for ${plan} plan`,
            handler: async function (response: any) {
                try {
                    const verifyRes = await fetch("/api/verify-payment", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(response),
                    });
                    const verifyData = await verifyRes.json();
                    if (verifyData.success) {
                        toast.success("Payment Successful!");
                        const returnUrl = searchParams?.get("returnUrl");
                        if (returnUrl) {
                            const url = new URL(returnUrl, window.location.origin);
                            url.searchParams.set("subscribed", "true");
                            router.push(url.toString());
                        } else {
                            router.push("/dashboard?subscribed=true");
                        }
                    } else {
                        toast.error("Payment verification failed.");
                    }
                } catch (err) {
                    toast.error("Error verifying payment.");
                }
            },
        };

        const payment = new (window as any).Razorpay(paymentData);
        payment.open();
    } catch (error) {
        console.error("Payment failed", error);
        toast.error("Failed to open payment gateway.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div
      id="pricing"
      ref={sectionRef}
      className="w-full bg-white pt-16 pb-24 px-4 sm:px-6 lg:px-8 relative z-10"
      style={{ fontFamily: "var(--font-raleway)" }}
    >
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />
      <div className="max-w-7xl auto mx-auto">
        {/* Header */}
        {pathname !== "/pricing" && (
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: isInView ? 1 : 0, y: isInView ? 0 : 30 }}
            transition={{ duration: 0.6, ease: easeOut }}
          >
            <div className="inline-block bg-[#EBE5FF] text-[#514088] rounded-full px-6 py-2 text-sm font-semibold mb-6">
              Pricing Plans
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-[#3B3356] mb-4">
              Simple, <span className="text-[#8C5BFF]">Transparent Pricing</span>
            </h2>
            <p className="text-[#666666] text-lg max-w-2xl mx-auto">
              All plans include a 14-day free trial with no credit card required.
            </p>
          </motion.div>
        )}

        {/* Pricing Cards */}
        <div className="flex flex-col lg:flex-row justify-center items-stretch gap-8 lg:gap-10 mt-12 px-4 max-w-6xl mx-auto">
          {/* Free Plan */}
          <motion.div
            className="flex-1 bg-white rounded-[2rem] border border-[#E9E4F5] p-8 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 relative flex flex-col"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: isInView ? 1 : 0, y: isInView ? 0 : 40 }}
            transition={{ duration: 0.6, ease: easeOut, delay: 0.2 }}
          >
            <div className="mb-6">
              <h3 className="text-3xl font-bold text-[#1A1A1A] mb-2">Free</h3>
              <p className="text-[#666666] text-sm">Perfect for trying out FlowSaaS</p>
            </div>
            <div className="mb-8">
              <div className="flex items-end">
                <span className="text-5xl font-extrabold text-[#1A1A1A]">$0</span>
                <span className="text-gray-500 text-lg mb-1 ml-1">/month</span>
              </div>
            </div>
            <button
              onClick={() => handleAuthRedirect(0, "free")}
              className="w-full bg-[#8C5BFF] hover:bg-[#7a4fcf] text-white font-semibold rounded-xl py-4 text-lg transition-colors cursor-pointer mb-8"
            >
              Get Started
            </button>
            <div className="flex-1">
              <ul className="space-y-4">
                {[
                  "Record up to 5 mins",
                  "Basic edit features",
                  "Up to 3 demos",
                  "Basic analytics included",
                  "Export 1 demo",
                ].map((feature, i) => (
                  <li key={i} className="flex items-start text-[#4A4A4A]">
                    <Check
                      className="w-5 h-5 text-[#8C5BFF] mr-3 shrink-0 mt-0.5"
                      strokeWidth={2.5}
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          {/* Pro Plan */}
          <motion.div
            className="flex-1 bg-[#8C5BFF] rounded-[2rem] p-8 md:p-10 shadow-[0_20px_40px_rgba(140,91,255,0.3)] hover:-translate-y-2 transition-all duration-300 relative flex flex-col z-10 lg:scale-[1.05]"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: isInView ? 1 : 0, y: isInView ? 0 : 40 }}
            transition={{ duration: 0.6, ease: easeOut, delay: 0.4 }}
          >
            <div className="absolute top-8 right-8">
              <span className="bg-[#FAA226] text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-md">
                Most Popular
              </span>
            </div>
            <div className="mb-6 mt-2">
              <h3 className="text-3xl font-bold text-white mb-2">Pro</h3>
              <p className="text-white/80 text-sm">Perfect for trying out FlowSaaS</p>
            </div>
            <div className="mb-8">
              <div className="flex items-end">
                <span className="text-5xl font-extrabold text-white">$49</span>
                <span className="text-white/80 text-lg mb-1 ml-1">/month</span>
              </div>
            </div>
            <button
              onClick={() => handleAuthRedirect(49, "pro")}
              className="w-full bg-white hover:bg-gray-50 text-[#8C5BFF] font-semibold rounded-xl py-4 text-lg transition-colors cursor-pointer mb-8 shadow-md disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Loading..." : "Start Free Trial"}
            </button>
            <div className="flex-1">
              <ul className="space-y-4">
                {[
                  "Full recording/editing",
                  "AI voiceover & subtitles",
                  "5 GB storage",
                  "30 demos/month",
                  "Request custom branding",
                ].map((feature, i) => (
                  <li key={i} className="flex items-start text-white">
                    <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center mr-3 shrink-0 mt-0.5">
                      <Check className="w-3.5 h-3.5 text-[#8C5BFF]" strokeWidth={3} />
                    </span>
                    <span className="font-medium text-white/95">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          {/* Enterprise Plan */}
          <motion.div
            className="flex-1 bg-white rounded-[2rem] border border-[#E9E4F5] p-8 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 relative flex flex-col"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: isInView ? 1 : 0, y: isInView ? 0 : 40 }}
            transition={{ duration: 0.6, ease: easeOut, delay: 0.6 }}
          >
            <div className="mb-6">
              <h3 className="text-3xl font-bold text-[#1A1A1A] mb-2">Enterprise</h3>
              <p className="text-[#666666] text-sm">For large organizations</p>
            </div>
            <div className="mb-8 h-[60px] flex items-end">
              <span className="text-4xl font-extrabold text-[#1A1A1A]">Enterprise</span>
            </div>
            <button
              onClick={() => handleAuthRedirect(0, "enterprise")}
              className="w-full bg-[#8C5BFF] hover:bg-[#7a4fcf] text-white font-semibold rounded-xl py-4 text-lg transition-colors cursor-pointer mb-8"
            >
              Contact Us
            </button>
            <div className="flex-1">
              <ul className="space-y-4">
                {[
                  "Everything in Pro",
                  "SSO & advanced analytics",
                  "Onboarding support",
                  "Unlimited demos & viewers",
                  "High usage or white-glove needs",
                ].map((feature, i) => (
                  <li key={i} className="flex items-start text-[#4A4A4A]">
                    <Check
                      className="w-5 h-5 text-[#8C5BFF] mr-3 shrink-0 mt-0.5"
                      strokeWidth={2.5}
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;

"use client";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import axios from "axios";

const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Please enter your email").email("Invalid email address"),
});

const ForgotPassword = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [animatePanel, setAnimatePanel] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => setAnimatePanel(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleForgot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const email = emailRef.current?.value.trim();
    try {
      forgotPasswordSchema.parse({ email });
      const res = await axios.post("/api/auth/request-reset", { email });
      if (res.status === 200) {
        toast.success("OTP sent to your email!");
        setTimeout(
          () => router.push(`/auth/reset-password?email=${encodeURIComponent(email!)}`),
          1500
        );
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        const message = err.errors.map((e) => e.message).join(" | ");
        toast.error(message);
      } else if (axios.isAxiosError(err)) {
        console.error("Axios error:", err.response?.data || err.message);
        const apiError = err.response?.data?.error || "Server error";
        toast.error(apiError);
      } else {
        console.error("Unknown error:", err);
        toast.error("Something went wrong.");
      }
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full min-h-screen font-sans bg-[#F1ECFF]">
      <div
        className="md:hidden absolute top-0 left-0 w-full h-20 bg-gradient-to-b from-[#313053] to-[#261753] z-[1000] flex justify-center items-center shadow-lg"
        style={{
          borderBottomLeftRadius: "50% 20%",
          borderBottomRightRadius: "50% 20%",
        }}
      >
        <div className="flex bg-[#313053]/80 backdrop-blur-sm rounded-full p-1.5 shadow-inner">
          <button
            onClick={() => router.push("/auth/signin")}
            className="px-6 py-2 rounded-full transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-[#615fa1] to-[#313053] text-white shadow-md"
          >
            Sign In
          </button>
        </div>
      </div>
      <div className="hidden md:flex md:w-1/2 relative justify-center items-center overflow-hidden rounded-r-[75px] bg-[#B09EE4]">
        <div
          className={`absolute inset-0 bg-[#261753] rounded-r-[75px] z-0 transition-all duration-700 ease-out ${
            animatePanel ? "mr-[20px]" : "mr-[100%]"
          }`}
        />
        <div className="relative z-10 px-6 sm:px-8">
          <Image
            src="/icons/sign-up-Vector.svg"
            alt="Forgot Illustration"
            width={400}
            height={400}
            className="max-w-full h-auto"
          />
        </div>
        <div className="absolute top-4 sm:top-6 left-6 sm:left-10 flex items-center gap-2 sm:gap-3 z-10">
          <Image src="/icons/logo.png" alt="Logo" width={28} height={28} />
          <span className="text-base sm:text-lg font-extrabold tracking-wider text-[#B09EE4]">
            MARVEDGE
          </span>
        </div>
        {/* Pulse elements */}
        <div className="absolute top-1/4 right-1/4 w-3 h-3 bg-white/20 rounded-full animate-pulse hover:scale-150 transition-transform duration-300"></div>
        <div className="absolute bottom-1/3 left-1/4 w-4 h-4 bg-white/15 rounded-full animate-pulse delay-1000 hover:scale-150 transition-transform duration-300"></div>
        <div className="absolute top-1/2 left-1/3 w-2 h-2 bg-white/25 rounded-full animate-pulse delay-500 hover:scale-150 transition-transform duration-300"></div>
        <div className="absolute top-1/5 left-1/5 w-2.5 h-2.5 bg-white/20 rounded-full animate-pulse delay-200 hover:scale-150 transition-transform duration-300"></div>
        <div className="absolute bottom-1/5 right-1/3 w-3.5 h-3.5 bg-white/15 rounded-full animate-pulse delay-1200 hover:scale-150 transition-transform duration-300"></div>
      </div>
      <div
        className={`w-full md:w-1/2 flex justify-center items-center px-4 sm:px-10 lg:px-20 py-10 transition-all duration-700 ease-out pt-24 md:pt-10 ${animatePanel ? "opacity-100 translate-x-0" : "opacity-0 translate-x-10"}`}
      >
        <form
          onSubmit={handleForgot}
          className="w-full max-w-md space-y-5 sm:space-y-6"
          autoComplete="on"
        >
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-black mb-2">Forgot Password</h1>
            <p className="text-sm text-gray-600 font-semibold">
              Enter your email to receive an OTP for password reset.
            </p>
          </div>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="Your Email"
            ref={emailRef}
            required
            className="w-full p-3 border-2 border-gray-500 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#6A4EFF] transition-all duration-300 focus:scale-[1.02] hover:border-[#B8AAFF]"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-[#6356D7] text-white rounded-md hover:bg-[#7E5FFF] font-semibold transition-all text-sm shadow-md"
          >
            {isLoading ? "Sending..." : "Send OTP"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ForgotPassword;

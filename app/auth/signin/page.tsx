"use client";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { z } from "zod";
import toast, { Toaster } from "react-hot-toast";

const signInSchema = z.object({
  email: z
    .string()
    .min(1, "Please enter your email")
    .email("Invalid email address"),
  password: z.string().min(1, "Please enter your password"),
});

const SignIn = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [animatePanel, setAnimatePanel] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const timeout = setTimeout(() => setAnimatePanel(true), 100);
    return () => clearTimeout(timeout);
  }, []);

  const togglePasswordVisibility = () => setShowPassword(!showPassword);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = emailRef.current?.value ?? "";
    const password = passwordRef.current?.value ?? "";
    setIsLoading(true);
    try {
      signInSchema.parse({ email, password });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
        setIsLoading(false);
        return;
      }
    }
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.ok) {
        toast.success("Signed in successfully!");
        router.push("/dashboard");
        setTimeout(() => window.location.reload(), 500);
      } else {
        toast.error(res?.error || "Invalid credentials.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full font-sans bg-[#F1ECFF]">
      <Toaster position="top-center" />
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
            className={`px-6 py-2 rounded-full transition-all duration-300 transform hover:scale-105 ${
              pathname === "/auth/signin"
                ? "bg-gradient-to-r from-[#615fa1] to-[#313053] text-white shadow-md"
                : "text-gray-300 hover:bg-[#615fa1] hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => router.push("/auth/signup")}
            className={`px-6 py-2 rounded-full transition-all duration-300 transform hover:scale-105 ${
              pathname === "/auth/signup"
                ? "bg-gradient-to-r from-[#615fa1] to-[#313053] text-white shadow-md"
                : "text-gray-300 hover:bg-[#615fa1] hover:text-white"
            }`}
          >
            Sign Up
          </button>
        </div>
      </div>

      <div
        className={`w-full md:w-1/2 flex justify-center items-center px-4 sm:px-10 lg:px-20 py-6 md:py-10 transition-all duration-700 ease-out pt-24 md:pt-10 ${
          animatePanel
            ? "opacity-100 translate-x-0"
            : "opacity-0 -translate-x-10"
        }`}
      >
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md space-y-4 sm:space-y-6"
          autoComplete="on"
        >
          <div className="text-center md:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-black mb-2">
              Sign In to your Account
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 font-semibold">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/auth/signup")}
                className="text-[#6356D7] hover:underline font-semibold"
              >
                Sign Up here.
              </button>
            </p>
          </div>
          <input
            type="email"
            placeholder="Your Email"
            ref={emailRef}
            name="email"
            autoComplete="username"
            className="w-full p-2.5 sm:p-3 border-2 border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-[#6A4EFF] text-sm transition-all duration-300 focus:scale-[1.02] hover:border-[#B8AAFF]"
            required
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter Password"
              ref={passwordRef}
              name="password"
              autoComplete="current-password"
              className="w-full p-2.5 sm:p-3 border-2 border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-[#6A4EFF] text-sm pr-10 transition-all duration-300 focus:scale-[1.02] hover:border-[#B8AAFF]"
              required
            />
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="absolute right-3 top-1/2 transform -translate-y-1/2"
            >
              <Image
                src={
                  showPassword ? "/icons/eyeclosed.png" : "/icons/eyeopen.png"
                }
                alt="Toggle Password"
                width={18}
                height={18}
                className="sm:w-[20px] sm:h-[20px]"
              />
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center text-xs sm:text-sm">
            <label className="flex items-center space-x-1 mb-2 sm:mb-0">
              <input
                type="checkbox"
                className="accent-[#6356D7] w-3.5 h-3.5 sm:w-4 sm:h-4"
              />
              <span className="font-semibold">Remember Me</span>
            </label>
            <button
              type="button"
              onClick={() => router.push("/auth/forgot-password")}
              className="text-[#6356D7] hover:underline font-bold"
            >
              Forgot password?
            </button>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 sm:py-3 bg-[#6356D7] text-white rounded-md hover:bg-[#7E5FFF] font-semibold transition-all text-sm shadow-md"
          >
            {isLoading ? "Signing In..." : "Sign In"}
          </button>
          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500">
            <div className="flex-grow border-t" />
            <span className="font-semibold">or sign in with</span>
            <div className="flex-grow border-t" />
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="h-10 sm:h-[45px] w-[100px] sm:w-[120px] rounded-md border border-[#D5C9FF] bg-[#F1ECFF] shadow-md hover:shadow-lg transition-all duration-300 active:scale-95 hover:scale-105 flex items-center justify-center"
              title="Sign in with Google"
            >
              <Image
                src="/icons/google.png"
                alt="Google"
                width={20}
                height={20}
                className="sm:w-[25px] sm:h-[25px]"
              />
            </button>
          </div>
        </form>
      </div>
      <div className="hidden md:flex md:w-1/2 relative justify-center items-center overflow-hidden rounded-l-[75px] bg-[#B09EE4]">
        <div
          className={`absolute inset-0 bg-[#261753] rounded-l-[75px] z-0 transition-all duration-700 ease-out ${
            animatePanel ? "ml-[20px]" : "ml-[100%]"
          }`}
        />
        <div className="relative z-10 px-6 sm:px-8">
          <Image
            src="/icons/login-vector.svg"
            alt="Login Illustration"
            width={400}
            height={400}
            className="max-w-full h-auto"
          />
        </div>
        <div className="absolute top-4 sm:top-6 right-6 sm:right-10 flex items-center gap-2 sm:gap-3 z-10">
          <Image src="/icons/logo.png" alt="Logo" width={28} height={28} />

          <span className="text-base sm:text-lg font-extrabold tracking-wider text-[#B09EE4]">
            MARVEDGE
          </span>
        </div>

        <div className="absolute top-1/4 right-1/4 w-3 h-3 bg-white/20 rounded-full animate-pulse hover:scale-150 transition-transform duration-300"></div>
        <div className="absolute bottom-1/3 left-1/4 w-4 h-4 bg-white/15 rounded-full animate-pulse delay-1000 hover:scale-150 transition-transform duration-300"></div>
        <div className="absolute top-1/2 left-1/3 w-2 h-2 bg-white/25 rounded-full animate-pulse delay-500 hover:scale-150 transition-transform duration-300"></div>
        <div className="absolute top-1/5 left-1/5 w-2.5 h-2.5 bg-white/20 rounded-full animate-pulse delay-200 hover:scale-150 transition-transform duration-300"></div>
        <div className="absolute bottom-1/5 right-1/3 w-3.5 h-3.5 bg-white/15 rounded-full animate-pulse delay-1200 hover:scale-150 transition-transform duration-300"></div>
      </div>
    </div>
  );
};

export default SignIn;

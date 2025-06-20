"use client";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import toast, { Toaster } from "react-hot-toast";

const signInSchema = z.object({
  email: z.string().min(1, "Please enter your email").email("Invalid email address"),
  password: z.string().min(1, "Please enter your password"),
});

const SignIn = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [animatePanel, setAnimatePanel] = useState(false);
  const router = useRouter();

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
    <div className="flex flex-col md:flex-row min-h-screen w-full font-sans bg-[#f1ecff]">
      <Toaster position="top-center" />

      {/* Left Form Panel */}
      <div
        className={`w-full md:w-1/2 flex justify-center items-center px-4 sm:px-10 lg:px-20 py-10 transition-all duration-700 ease-out ${
          animatePanel ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
        }`}
      >
        <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5 sm:space-y-6" autoComplete="on">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-black mb-2">Sign In to your Account</h1>
            <p className="text-sm text-gray-600 font-semibold">
              Don’t have an account?{' '}
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
            className="w-full p-3 border-2 border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-[#6a4eff] text-sm transition-all duration-300 focus:scale-[1.02] hover:border-[#b8aaff]"
            required
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter Password"
              ref={passwordRef}
              name="password"
              autoComplete="current-password"
              className="w-full p-3 border-2 border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-[#6a4eff] text-sm pr-10 transition-all duration-300 focus:scale-[1.02] hover:border-[#b8aaff]"
              required
            />
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="absolute right-3 top-1/2 transform -translate-y-1/2"
            >
              <Image
                src={showPassword ? "/icons/eyeclosed.png" : "/icons/eyeopen.png"}
                alt="Toggle Password"
                width={20}
                height={20}
              />
            </button>
          </div>

          <div className="flex justify-between items-center text-sm">
            <label className="flex items-center space-x-1">
              <input type="checkbox" className="accent-[#6356D7]" />
              <span className="font-semibold">Remember Me</span>
            </label>
            <button type="button" onClick={() => router.push("/auth/forgot-password")} className="text-[#6356D7] hover:underline font-bold">
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-[#6356D7] text-white rounded-md hover:bg-[#7e5fff] font-semibold transition-all text-sm shadow-md"
          >
            {isLoading ? "Signing In..." : "Sign In"}
          </button>

          <div className="flex items-center gap-4 text-sm text-gray-500">
            <div className="flex-grow border-t" />
            <span className="text-sm font-semibold text-gray-500">or sign in with</span>
            <div className="flex-grow border-t" />
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => signIn("google")}
              className="h-[45px] w-[120px] rounded-md border border-[#d5c9ff] bg-[#f1ecff] shadow-md hover:shadow-lg transition-all duration-300 active:scale-95 hover:scale-105 flex items-center justify-center"
              title="Sign in with Google"
            >
              <Image src="/icons/google.png" alt="Google" width={25} height={25} />
            </button>
          </div>
        </form>
      </div>

      {/* Right Illustration Panel */}
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
          <span className="text-base sm:text-lg font-extrabold tracking-wider text-[#b09ee4]">MARVEDGE</span>
        </div>
      </div>
    </div>
  );
};

export default SignIn;


"use client";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useSignIn } from "./useSignIn";
import { getSafeCallbackUrl } from "./useSignIn";
import SignInMobileNav from "./SignInMobileNav";
import SignInIllustration from "./SignInIllustration";

const SignIn = () => {
  const {
    showPassword,
    togglePasswordVisibility,
    isLoading,
    animatePanel,
    emailRef,
    passwordRef,
    router,
    handleSubmit,
  } = useSignIn();

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full font-sans bg-[#F1ECFF] dark:bg-[#03030b]">
      <SignInMobileNav />

      <div
        className={`w-full md:w-1/2 flex justify-center items-center px-4 sm:px-10 lg:px-20 py-6 md:py-10 transition-all duration-700 ease-out pt-24 md:pt-10 ${
          animatePanel ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
        }`}
      >
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md space-y-4 sm:space-y-6"
          autoComplete="on"
        >
          <div className="text-center md:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-black dark:text-white mb-2">
              Sign In to your Account
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-[#9d9db5] font-semibold">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/auth/signup")}
                className="text-[#6356D7] dark:text-[#8b5cff] hover:underline font-semibold cursor-pointer"
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
            className="w-full p-2.5 sm:p-3 border-2 border-gray-500 dark:border-[#3d2a73] dark:bg-transparent dark:text-white dark:placeholder-[#7f7f96] rounded-md focus:outline-none focus:ring-2 focus:ring-[#6A4EFF] dark:focus:ring-[#8f5fff] text-sm transition-all duration-300 focus:scale-[1.02] hover:border-[#B8AAFF] dark:hover:border-[#6e43ff]"
            required
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter Password"
              ref={passwordRef}
              name="password"
              autoComplete="current-password"
              className="w-full p-2.5 sm:p-3 border-2 border-gray-500 dark:border-[#3d2a73] dark:bg-transparent dark:text-white dark:placeholder-[#7f7f96] rounded-md focus:outline-none focus:ring-2 focus:ring-[#6A4EFF] dark:focus:ring-[#8f5fff] text-sm pr-10 transition-all duration-300 focus:scale-[1.02] hover:border-[#B8AAFF] dark:hover:border-[#6e43ff] "
              required
            />
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer"
            >
              <Image
                src={showPassword ? "/icons/eyeclosed.png" : "/icons/eyeopen.png"}
                alt="Toggle Password"
                width={18}
                height={18}
                className="sm:w-[20px] sm:h-[20px] dark:invert"
              />
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center text-xs sm:text-sm">
            <label className="flex items-center space-x-1 mb-2 sm:mb-0 cursor-pointer">
              <input
                type="checkbox"
                className="accent-[#6356D7] dark:accent-[#8f5fff] w-3.5 h-3.5 sm:w-4 sm:h-4"
              />
              <span className="font-semibold dark:text-white">Remember Me</span>
            </label>
            <button
              type="button"
              onClick={() => router.push("/auth/forgot-password")}
              className="text-[#6356D7] dark:text-[#8b5cff] hover:underline font-bold cursor-pointer"
            >
              Forgot password?
            </button>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 sm:py-3 cursor-pointer bg-[#6356D7] dark:bg-gradient-to-r dark:from-[#6e43ff] dark:to-[#8f5fff] dark:shadow-[0_0_20px_rgba(120,70,255,0.4)] text-white rounded-md hover:bg-[#7E5FFF] font-semibold transition-all text-sm shadow-md"
          >
            {isLoading ? "Signing In..." : "Sign In"}
          </button>
          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500">
            <div className="flex-grow border-t dark:border-[#2b2b38]" />
            <span className="font-semibold dark:text-[#9f9fb6]">or sign in with</span>
            <div className="flex-grow border-t dark:border-[#2b2b38]" />
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                signIn("google", {
                  callbackUrl: getSafeCallbackUrl(params.get("callbackUrl")),
                });
              }}
              className="h-10 sm:h-[45px] w-[100px] sm:w-[120px] rounded-md border border-[#D5C9FF] dark:border-[#2f2f44] bg-[#F1ECFF] dark:bg-[#070710] shadow-md hover:shadow-lg transition-all duration-300 active:scale-95 hover:scale-105 flex items-center justify-center cursor-pointer"
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
      <SignInIllustration animatePanel={animatePanel} />
    </div>
  );
};

export default SignIn;

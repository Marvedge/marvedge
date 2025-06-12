"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import axios from "axios";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import toast, { Toaster } from "react-hot-toast";

interface AnimatedTextProps {
  text: string;
  delay?: number;
}

const AnimatedText = ({ text, delay = 0 }: AnimatedTextProps) => {
  const [displayedText, setDisplayedText] = useState<string[]>([]);
  useEffect(() => {
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex <= text.length) {
        setDisplayedText(text.substring(0, currentIndex).split(""));
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [text]);
  return (
    <span>
      {displayedText.map((char, index) => (
        <span
          key={index}
          className="animate-char"
          style={{ animationDelay: `${index * 0.2}s` }}
        >
          {char}
        </span>
      ))}
    </span>
  );
};

const signUpSchema = z
  .object({
    name: z.string().min(1, "Please enter your name"),
    email: z
      .string()
      .min(1, "Please enter your email")
      .email("Invalid email address"),
    password: z
      .string()
      .min(1, "Please enter your password")
      .min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please enter your confirm password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const signInSchema = z.object({
  email: z
    .string()
    .min(1, "Please enter your email")
    .email("Invalid email address"),
  password: z.string().min(1, "Please enter your password"),
});

const Signin = () => {
  const [isActive, setIsActive] = useState(false);
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const signInEmailRef = useRef<HTMLInputElement>(null);
  const signInPasswordRef = useRef<HTMLInputElement>(null);
  const signUpNameRef = useRef<HTMLInputElement>(null);
  const signUpEmailRef = useRef<HTMLInputElement>(null);
  const signUpPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleSignUpClick = () => setIsActive(true);
  const handleSignInClick = () => setIsActive(false);
  const toggleSignInPassword = () => setShowSignInPassword(!showSignInPassword);
  const toggleSignUpPassword = () => setShowSignUpPassword(!showSignUpPassword);
  const toggleConfirmPassword = () =>
    setShowConfirmPassword(!showConfirmPassword);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const email = signInEmailRef.current?.value?.trim() ?? "";
    const password = signInPasswordRef.current?.value ?? "";

    try {
      signInSchema.parse({ email, password });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message, {
          className: "custom-toast custom-toast-error",
        });
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
        toast.success("Signed in successfully!", {
          className: "custom-toast custom-toast-success",
        });
        router.push("/dashboard");
      } else {
        toast.error(res?.error || "Invalid credentials.", {
          className: "custom-toast custom-toast-error",
        });
      }
    } catch (error) {
      console.error("Sign-in error:", error);
      toast.error("An error occurred during sign-in.", {
        className: "custom-toast custom-toast-error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const name = signUpNameRef.current?.value?.trim() ?? "";
    const email = signUpEmailRef.current?.value?.trim() ?? "";
    const password = signUpPasswordRef.current?.value ?? "";
    const confirmPassword = confirmPasswordRef.current?.value ?? "";

    try {
      const validated = signUpSchema.parse({
        name,
        email,
        password,
        confirmPassword,
      });

      const attemptSignUp = async (maxAttempts = 3, delayMs = 1000) => {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const res = await axios.post("/api/auth/signup", {
              name: validated.name,
              email: validated.email,
              password: validated.password,
            });
            console.log("Signed up:", res.data);
            toast.success("Account created successfully! Please sign in.", {
              className: "custom-toast custom-toast-success",
            });
            handleSignInClick();
            return true;
          } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
              const status = error.response?.status;
              const message = error.response?.data?.error || "Sign-up failed.";
              if ((status === 500 || status === 503) && attempt < maxAttempts) {
                console.warn(
                  `Attempt ${attempt} failed with status ${status}. Retrying in ${
                    delayMs * attempt
                  }ms...`
                );
                await new Promise((resolve) =>
                  setTimeout(resolve, delayMs * attempt)
                );
                continue;
              }
              throw new Error(message);
            }
            throw error;
          }
        }
        return false;
      };

      const success = await attemptSignUp();
      if (!success) {
        throw new Error("Sign-up failed after maximum attempts.");
      }
    } catch (error: unknown) {
      console.error("Sign-up error:", error);
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message, {
          className: "custom-toast custom-toast-error",
        });
      } else if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.error || "Sign-up failed.";
        if (status === 503) {
          toast.error(
            "Database is temporarily unavailable. Please try again.",
            {
              className: "custom-toast custom-toast-error",
            }
          );
        } else if (status === 400) {
          toast.error(message, {
            className: "custom-toast custom-toast-error",
          });
        } else {
          toast.error("An unexpected error occurred. Please try again.", {
            className: "custom-toast custom-toast-error",
          });
        }
      } else {
        toast.error("An unexpected error occurred.", {
          className: "custom-toast custom-toast-error",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gradient-to-b from-purple-200 to-purple-300 p-4 md:p-0">
      <Toaster
        position="top-center"
        reverseOrder={false}
        gutter={12}
        toastOptions={{
          duration: 4000,
          offset: -40,
          containerStyle: { display: "flex", justifyContent: "center" },
        }}
      />
      <div className="absolute top-2 left-4 md:left-8 z-[1001]">
        <Image
          src="/images/Transparent logo.png"
          alt="Logo"
          width={80}
          height={120}
          className="w-16 md:w-20"
          priority
        />
      </div>
      <div
        className="container relative bg-white rounded-3xl shadow-lg overflow-hidden w-full md:w-[1000px] lg:w-[1200px]"
        style={{ minHeight: "700px" }}
      >
        <div
          className="md:hidden absolute top-0 left-0 w-full h-16 bg-[#313053] z-[1000] flex justify-center items-center"
          style={{
            borderBottomLeftRadius: "50% 20%",
            borderBottomRightRadius: "50% 20%",
          }}
        >
          <div className="flex bg-[#313053] rounded-full p-1">
            <button
              onClick={handleSignInClick}
              className={`px-6 py-2 rounded-full transition-colors duration-300 ${
                !isActive
                  ? "bg-white text-[#313053] hover:bg-[#615fa1] hover:text-white"
                  : "text-white hover:bg-[#615fa1]"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={handleSignUpClick}
              className={`px-6 py-2 rounded-full transition-colors duration-300 ${
                isActive
                  ? "bg-white text-[#313053] hover:bg-[#615fa1] hover:text-white"
                  : "text-white hover:bg-[#615fa1]"
              }`}
            >
              Sign Up
            </button>
          </div>
        </div>
        <div
          className={`form-container sign-in absolute top-0 left-0 w-full md:w-1/2 h-full flex flex-col justify-center items-center bg-white p-4 md:p-8 pt-20 md:pt-28 transition-all duration-600 ease-in-out z-[2] ${
            isActive
              ? "translate-y-full md:translate-y-0 md:translate-x-full opacity-0 md:opacity-100"
              : "translate-y-0 opacity-100"
          }`}
        >
          <form
            className="w-full flex flex-col items-center"
            onSubmit={handleSignIn}
          >
            <h1 className="text-2xl font-semibold mb-6 text-center">Sign In</h1>
            <div className="social-icons flex justify-center mb-6">
              <a
                href="#"
                className="icon border border-[#004754] rounded-full flex justify-center items-center w-10 h-10 mr-2 hover:bg-[#615fa1] transition-all duration-200"
                title="Login with Google"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              </a>
              <a
                href="#"
                className="icon border border-[#004754] rounded-full flex justify-center items-center w-10 h-10 mr-2 hover:bg-[#615fa1] transition-all duration-200"
                title="Login with GitHub"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="currentColor"
                >
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
              </a>
              <a
                href="#"
                className="icon border border-[#004754] rounded-full flex justify-center items-center w-10 h-10 hover:bg-[#615fa1] transition-all duration-200"
                title="Login with LinkedIn"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="currentColor"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452z" />
                </svg>
              </a>
            </div>
            <span className="text-xl mb-6 block text-center font-medium text-gray-500">
              OR
            </span>
            <span className="text-lg mb-6 block text-center font-medium">
              Login With Your Email & Password
            </span>
            <input
              type="email"
              placeholder="Email"
              className="w-full p-2 mb-3 bg-gray-300 border-none outline-none rounded-md text-center text-base placeholder-center"
              required
              ref={signInEmailRef}
            />
            <div className="relative w-full mb-3">
              <input
                type={showSignInPassword ? "text" : "password"}
                placeholder="Password"
                className="w-full p-2 bg-gray-300 border-none outline-none rounded-md text-center text-base pr-10 placeholder-center"
                required
                ref={signInPasswordRef}
              />
              <button
                type="button"
                onClick={toggleSignInPassword}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500"
              >
                {showSignInPassword ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                      clipRule="evenodd"
                    />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.303 6.546A11.942 11.942 0 000 10c1.274 4.057 5.064 7 9.542 7a9.958 9.958 0 003.912-.803z" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path
                      fillRule="evenodd"
                      d="M10 3a7 7 0 100 14 7 7 0 000-14zm0 12a5 5 0 100-10 5 5 0 000 10z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            </div>
            <button
              type="submit"
              className="w-[65%] md:w-1/2 mx-auto bg-[#313053] hover:bg-[#615fa1] rounded-md text-white px-4 py-2 border-none font-semibold uppercase mt-2 cursor-pointer transition-colors duration-300"
              disabled={isLoading}
            >
              {isLoading ? "Signing In..." : "Sign In"}
            </button>
            <button
              type="button"
              className="w-[65%] md:w-1/2 mx-auto bg-[#313053] hover:bg-[#615fa1] rounded-md text-white px-4 py-2 border-none font-semibold uppercase mt-2 cursor-pointer transition-colors duration-300 whitespace-nowrap"
              disabled={isLoading}
            >
              Forgot Password
            </button>
          </form>
        </div>
        <div
          className={`form-container sign-up absolute top-0 left-0 w-full md:w-1/2 h-full flex flex-col justify-center items-center bg-white p-4 md:p-8 pt-20 md:pt-28 transition-all duration-600 ease-in-out ${
            isActive
              ? "translate-y-0 md:translate-x-full opacity-100 z-[5]"
              : "-translate-y-full md:translate-y-0 opacity-0 md:opacity-100 z-[1]"
          }`}
        >
          <form
            className="w-full flex flex-col items-center"
            onSubmit={handleSignUp}
          >
            <h1 className="text-5xl font-semibold mb-6 text-center">
              Create Account
            </h1>
            <div className="social-icons flex justify-center mb-6">
              <a
                href="#"
                className="icon border border-[#004754] rounded-full flex justify-center items-center w-10 h-10 mr-2 hover:bg-[#615fa1] transition-all duration-200"
                title="Register with Google"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              </a>
              <a
                href="#"
                className="icon border border-[#004754] rounded-full flex justify-center items-center w-10 h-10 mr-2 hover:bg-[#615fa1] transition-all duration-200"
                title="Register with GitHub"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="currentColor"
                >
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
              </a>
              <a
                href="#"
                className="icon border border-[#004754] rounded-full flex justify-center items-center w-10 h-10 hover:bg-[#615fa1] transition-all duration-200"
                title="Register with LinkedIn"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="currentColor"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452z" />
                </svg>
              </a>
            </div>
            <span className="text-xl mb-6 block text-center font-medium text-gray-500">
              OR
            </span>
            <span className="text-lg mb-6 block text-center font-medium">
              Fill Out The Following Info For Registration
            </span>
            <input
              type="text"
              placeholder="Name"
              className="w-full p-2 mb-3 bg-gray-300 border-none outline-none rounded-md text-center text-base placeholder-center"
              required
              ref={signUpNameRef}
            />
            <input
              type="email"
              placeholder="Email"
              className="w-full p-2 mb-3 bg-gray-300 border-none outline-none rounded-md text-center text-base placeholder-center"
              required
              ref={signUpEmailRef}
            />
            <div className="relative w-full mb-3">
              <input
                type={showSignUpPassword ? "text" : "password"}
                placeholder="Password"
                className="w-full p-2 bg-gray-300 border-none outline-none rounded-md text-center text-base pr-10 placeholder-center"
                required
                ref={signUpPasswordRef}
              />
              <button
                type="button"
                onClick={toggleSignUpPassword}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500"
              >
                {showSignUpPassword ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                      clipRule="evenodd"
                    />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.303 6.546A11.942 11.942 0 000 10c1.274 4.057 5.064 7 9.542 7a9.958 9.958 0 003.912-.803z" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path
                      fillRule="evenodd"
                      d="M10 3a7 7 0 100 14 7 7 0 000-14zm0 12a5 5 0 100-10 5 5 0 000 10z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            </div>
            <div className="relative w-full mb-3">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm Password"
                className="w-full p-2 bg-gray-300 border-none outline-none rounded-md text-center text-base pr-10 placeholder-center"
                required
                ref={confirmPasswordRef}
              />
              <button
                type="button"
                onClick={toggleConfirmPassword}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500"
              >
                {showConfirmPassword ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                      clipRule="evenodd"
                    />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.303 6.546A11.942 11.942 0 000 10c1.274 4.057 5.064 7 9.542 7a9.958 9.958 0 003.912-.803z" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path
                      fillRule="evenodd"
                      d="M10 3a7 7 0 100 14 7 7 0 000-14zm0 12a5 5 0 100-10 5 5 0 000 10z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            </div>
            <button
              type="submit"
              className="w-[65%] md:w-1/2 mx-auto bg-[#313053] hover:bg-[#615fa1] rounded-md text-white px-4 py-2 border-none font-semibold uppercase mt-2 cursor-pointer transition-colors duration-300"
              disabled={isLoading}
            >
              {isLoading ? "Signing Up..." : "Sign Up"}
            </button>
          </form>
        </div>
        <div
          className={`hidden md:block absolute top-0 left-1/2 w-1/2 h-full overflow-hidden transition-all duration-600 ease-in-out z-[1000] ${
            isActive ? "translate-x-[-100%]" : ""
          }`}
          style={{
            borderRadius: isActive ? "0 150px 100px 0" : "150px 0 0 100px",
          }}
        >
          <div
            className="toggle h-full bg-[#313053] text-white flex relative left-[-100%] w-[200%] transition-all duration-600 ease-in-out"
            style={{
              transform: isActive ? "translateX(50%)" : "translateX(0)",
            }}
          >
            <div
              className="toggle-panel toggle-left w-1/2 h-full flex flex-col justify-center items-center p-6 text-center transition-all duration-600 ease-in-out"
              style={{
                transform: isActive ? "translateX(0)" : "translateX(-200%)",
              }}
            >
              <div className="text-4xl font-semibold mb-4 flex items-center justify-center">
                <AnimatedText text="Welcome Back!" />
                <span className="animate-wave ml-2">👋</span>
              </div>
              <p className="text-base mb-6 leading-relaxed">
                Enter your personal details to use all of our site features
              </p>
              <button
                onClick={handleSignInClick}
                className="bg-transparent border rounded-md border-white text-white px-6 py-2 uppercase cursor-pointer hover:bg-[#615fa1] transition-colors duration-300"
              >
                Sign In
              </button>
            </div>
            <div
              className="toggle-panel toggle-right w-1/2 h-full flex flex-col justify-center items-center p-6 text-center transition-all duration-600 ease-in-out absolute right-0"
              style={{
                transform: isActive ? "translateX(200%)" : "translateX(0)",
              }}
            >
              <div className="text-4xl font-semibold mb-4 flex items-center justify-center">
                <AnimatedText text="Hello, Friend!" />
                <span className="animate-wave ml-2">👋</span>
              </div>
              <p className="text-base mb-6 leading-relaxed">
                Register with your personal details to use all features in our
                site
              </p>
              <button
                onClick={handleSignUpClick}
                className="bg-transparent border rounded-md border-white text-white px-6 py-2 uppercase cursor-pointer hover:bg-[#615fa1] transition-colors duration-300"
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes wave {
          0% {
            transform: rotate(0deg);
          }
          25% {
            transform: rotate(20deg);
          }
          50% {
            transform: rotate(0deg);
          }
          75% {
            transform: rotate(-20deg);
          }
          100% {
            transform: rotate(0deg);
          }
        }
        @keyframes charFade {
          0% {
            opacity: 0;
            transform: scale(0.8) translateY(10px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes popupSlideIn {
          0% {
            opacity: 0;
            transform: translateY(-20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes popupSlideOut {
          0% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(-20px);
          }
        }
        .animate-wave {
          animation: wave 1.5s ease-in-out infinite;
          display: inline-block;
          font-size: 1.5rem;
          line-height: 1;
        }
        .animate-char {
          display: inline-block;
          animation: charFade 0.5s ease-out forwards;
        }
        .custom-toast {
          display: flex;
          align-items: center;
          min-width: 250px;
          max-width: 350px;
          padding: 12px 16px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          font-size: 14px;
          font-weight: 500;
          color: #fff;
          white-space: nowrap;
          animation: popupSlideIn 0.3s ease-out forwards;
        }
        .custom-toast-success {
          background: linear-gradient(135deg, #34d399, #10b981);
        }
        .custom-toast-success::before {
          content: "✔";
          font-size: 16px;
          margin-right: 8px;
        }
        .custom-toast-error {
          background: linear-gradient(135deg, #f87171, #ef4444);
        }
        .custom-toast-error::before {
          content: "✖";
          font-size: 16px;
          margin-right: 8px;
        }
        .custom-toast[aria-hidden="true"] {
          animation: popupSlideOut 0.3s ease-in forwards;
        }
        .placeholder-center::placeholder {
          text-align: center;
        }
      `}</style>
    </div>
  );
};

export default Signin;

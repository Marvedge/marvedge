"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import axios from "axios";
import { useRouter } from "next/navigation";
import { z } from "zod";
import toast, { Toaster } from "react-hot-toast";

interface AnimatedTextProps {
  text: string;
}

const AnimatedText = ({ text }: AnimatedTextProps) => {
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

const SignUp = () => {
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const signUpNameRef = useRef<HTMLInputElement>(null);
  const signUpEmailRef = useRef<HTMLInputElement>(null);
  const signUpPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const toggleSignUpPassword = () => setShowSignUpPassword(!showSignUpPassword);
  const toggleConfirmPassword = () =>
    setShowConfirmPassword(!showConfirmPassword);

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    if (
      !signUpNameRef.current ||
      !signUpEmailRef.current ||
      !signUpPasswordRef.current ||
      !confirmPasswordRef.current
    ) {
      toast.error("Form fields are not available.", {
        style: {
          background: "linear-gradient(135deg, #f87171, #ef4444)",
          color: "#fff",
          fontSize: "14px",
          fontWeight: "500",
          marginTop: "18px",
        },
      });
      setIsLoading(false);
      return;
    }

    const formData = {
      name: signUpNameRef.current.value.trim(),
      email: signUpEmailRef.current.value.trim(),
      password: signUpPasswordRef.current.value,
      confirmPassword: confirmPasswordRef.current.value,
    };

    try {
      const validated = signUpSchema.parse(formData);

      const attemptSignUp = async (maxAttempts = 3, delayMs = 1000) => {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const response = await axios.post("/api/auth/signup", {
              name: validated.name,
              email: validated.email,
              password: validated.password,
            });
            if (response.status === 201 || response.status === 200) {
              toast.success("Account created successfully! Please sign in.", {
                style: {
                  background: "linear-gradient(135deg, #34d399, #10b981)",
                  color: "#fff",
                  fontSize: "14px",
                  marginTop: "18px",
                  fontWeight: "500",
                },
              });
              router.push("/auth/signin");
              return true;
            }
            throw new Error("Unexpected response status.");
          } catch (error) {
            if (axios.isAxiosError(error)) {
              const status = error.response?.status;
              const message = error.response?.data?.error || "Sign-up failed.";
              if ((status === 500 || status === 503) && attempt < maxAttempts) {
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

      if (!(await attemptSignUp())) {
        throw new Error("Sign-up failed after maximum attempts.");
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message, {
          style: {
            background: "linear-gradient(135deg, #f87171, #ef4444)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: "500",
            marginTop: "18px",
          },
        });
      } else if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.error || "Sign-up failed.";
        toast.error(
          status === 503
            ? "Database is temporarily unavailable. Please try again."
            : message,
          {
            style: {
              background: "linear-gradient(135deg, #f87171, #ef4444)",
              color: "#fff",
              fontSize: "14px",
              fontWeight: "500",
              marginTop: "18px",
            },
          }
        );
      } else {
        toast.error("An unexpected error occurred.", {
          style: {
            background: "linear-gradient(135deg, #f87171, #ef4444)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: "500",
            marginTop: "18px",
          },
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
          style: {
            display: "flex",
            justifyContent: "center",
            minWidth: "250px",
            maxWidth: "350px",
            padding: "12px 16px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            fontSize: "14px",
            fontWeight: "500",
            color: "#fff",
          },
          success: {
            style: {
              background: "linear-gradient(135deg, #34d399, #10b981)",
            },
            icon: "✔",
          },
          error: {
            style: {
              background: "linear-gradient(135deg, #f87171, #ef4444)",
            },
            icon: "✖",
          },
        }}
      />
      <div className="absolute top-2 left-4 md:left-8 z-[999]">
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
        className="container relative bg-white rounded-3xl shadow-lg overflow-hidden w-full md:w-[1000px] lg:w-[1200px] flex flex-col md:flex-row"
        style={{ minHeight: "700px" }}
      >
        <div
          className="hidden md:block w-full md:w-1/2 h-[700px] bg-[#313053] text-white flex relative z-[1000]"
          style={{ borderRadius: "0 150px 100px 0" }}
        >
          <div className="toggle-panel toggle-left w-full h-full flex flex-col justify-center items-center p-6 text-center">
            <div className="text-4xl font-semibold mb-4 flex items-center justify-center">
              <AnimatedText text="Welcome Back!" />
              <span className="animate-wave ml-2">👋</span>
            </div>
            <p className="text-base mb-6 leading-relaxed">
              Enter your personal details to use all of our site features
            </p>
            <button
              type="button"
              onClick={() => router.push("/auth/signin")}
              className="bg-transparent border rounded-md border-white text-white px-6 py-2 uppercase cursor-pointer hover:bg-[#615fa1] transition-colors duration-300"
            >
              Sign In
            </button>
          </div>
        </div>
        <div
          className="md:hidden flex justify-center items-center absolute top-0 left-0 w-full h-16 bg-[#313053] z-[1003]"
          style={{
            borderBottomLeftRadius: "50% 20%",
            borderBottomRightRadius: "50% 20%",
          }}
        >
          <div className="flex bg-[#313053] rounded-full p-1">
            <button
              type="button"
              onClick={() => router.push("/auth/signin")}
              className="px-6 py-2 rounded-full transition-colors duration-300 text-white hover:bg-[#615fa1]"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => router.push("/auth/signup")}
              className="px-6 py-2 rounded-full transition-colors duration-300 bg-white text-[#313053] hover:bg-[#615fa1] hover:text-white"
            >
              Sign Up
            </button>
          </div>
        </div>
        <div className="form-container w-full md:w-1/2 md:ml-auto h-full flex flex-col justify-center items-center bg-white p-4 md:p-8 pt-24 md:pt-8 z-[1001]">
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
                <Image
                  src="/icons/google.png"
                  alt="Google Login"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
              </a>
              <a
                href="#"
                className="icon border border-[#004754] rounded-full flex justify-center items-center w-10 h-10 mr-2 hover:bg-[#615fa1] transition-all duration-200"
                title="Register with GitHub"
              >
                <Image
                  src="/icons/github.png"
                  alt="Google Login"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
              </a>
              <a
                href="#"
                className="icon border border-[#004754] rounded-full flex justify-center items-center w-10 h-10 hover:bg-[#615fa1] transition-all duration-200"
                title="Register with LinkedIn"
              >
                <Image
                  src="/icons/LinkedIn.png"
                  alt="Google Login"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
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
                  <Image
                    src="/icons/eyeclosed.png"
                    alt="Hide Password"
                    width={20}
                    height={20}
                    className="h-5 w-5"
                  />
                ) : (
                  <Image
                    src="/icons/eyeopen.png"
                    alt="Show Password"
                    width={20}
                    height={20}
                    className="h-5 w-5"
                  />
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
                  <Image
                    src="/icons/eyeclosed.png"
                    alt="Show Password"
                    width={20}
                    height={20}
                    className="h-5 w-5"
                  />
                ) : (
                  <Image
                    src="/icons/eyeopen.png"
                    alt="Show Password"
                    width={20}
                    height={20}
                    className="h-5 w-5"
                  />
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
            <button
              type="button"
              className="w-[65%] md:w-1/2 mx-auto bg-[#313053] hover:bg-[#615fa1] rounded-md text-white px-4 py-2 border-none font-semibold uppercase mt-2 cursor-pointer transition-colors duration-300 whitespace-nowrap"
              disabled={isLoading}
              onClick={() => router.push("/auth/forgot-password")}
            >
              Forgot Password
            </button>
          </form>
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
        .placeholder-center::placeholder {
          text-align: center;
        }
      `}</style>
    </div>
  );
};

export default SignUp;

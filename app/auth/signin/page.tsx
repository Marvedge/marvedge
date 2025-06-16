"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
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

const signInSchema = z.object({
  email: z
    .string()
    .min(1, "Please enter your email")
    .email("Invalid email address"),
  password: z.string().min(1, "Please enter your password"),
});

const SignIn = () => {
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const signInEmailRef = useRef<HTMLInputElement>(null);
  const signInPasswordRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const toggleSignInPassword = () => setShowSignInPassword(!showSignInPassword);

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
          className: "custom-toast mt-18 custom-toast-error",
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
          className: "custom-toast mt-18 custom-toast-success",
        });
        router.push("/dashboard");
      } else {
        toast.error(res?.error || "Invalid credentials.", {
          className: "custom-toast mt-18 custom-toast-error",
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

  return (
    <div className="flex justify-center items-center min-h-screen bg-gradient-to-b from-purple-200 to-purple-300 p-4 md:p-0">
      <Toaster
        containerStyle={{
          marginTop: "-40px",
          display: "flex",
          justifyContent: "center",
        }}
        toastOptions={{
          duration: 4000,
        }}
      />

      <div className="absolute top-2 left-4 md:left-8 z-[1001]">
        <Image
          src="/icons/Transparent logo.png"
          alt="Logo"
          width={80}
          height={120}
          className="w-14 md:w-18"
          priority
        />
      </div>
      <div
        className="container relative bg-white rounded-3xl shadow-lg overflow-hidden w-full md:w-[800px] lg:w-[960px]"
        style={{ minHeight: "600px" }}
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
              onClick={() => router.push("/auth/signin")}
              className="px-6 py-2 rounded-full transition-colors duration-300 bg-white text-[#313053] hover:bg-[#615fa1] hover:text-white"
            >
              Sign In
            </button>
            <button
              onClick={() => router.push("/auth/signup")}
              className="px-6 py-2 rounded-full transition-colors duration-300 text-white hover:bg-[#615fa1]"
            >
              Sign Up
            </button>
          </div>
        </div>
        <div className="form-container w-full md:w-1/2 h-full flex flex-col justify-center items-center bg-white p-4 md:p-6 pt-16 md:pt-20">
          <form
            className="w-full flex flex-col items-center"
            onSubmit={handleSignIn}
          >
            <h1 className="text-4xl font-semibold mb-5 text-center">Sign In</h1>
            <div className="social-icons flex justify-center mb-5">
              <a
                href="#"
                className="icon border border-[#004754] rounded-full flex justify-center items-center w-10 h-10 mr-2 hover:bg-[#615fa1] transition-all duration-200"
                title="Login with Google"
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
                title="Login with GitHub"
              >
                <Image
                  src="/icons/github.png"
                  alt="GitHub Login"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
              </a>
              <a
                href="#"
                className="icon border border-[#004754] rounded-full flex justify-center items-center w-10 h-10 hover:bg-[#615fa1] transition-all duration-200"
                title="Login with LinkedIn"
              >
                <Image
                  src="/icons/LinkedIn.png"
                  alt="LinkedIn Login"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
              </a>
            </div>
            <span className="text-lg mb-5 block text-center font-medium text-gray-500">
              OR
            </span>
            <span className="text-base mb-5 block text-center font-medium">
              Login With Your Email & Password
            </span>
            <input
              type="email"
              placeholder="Email"
              className="w-full p-2 mb-3 bg-gray-300 border-none outline-none rounded-md text-center text-sm placeholder-center"
              required
              ref={signInEmailRef}
            />
            <div className="relative w-full mb-3">
              <input
                type={showSignInPassword ? "text" : "password"}
                placeholder="Password"
                className="w-full p-2 bg-gray-300 border-none outline-none rounded-md text-center text-sm pr-10 placeholder-center"
                required
                ref={signInPasswordRef}
              />
              <button
                type="button"
                onClick={toggleSignInPassword}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500"
              >
                {showSignInPassword ? (
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
            <button
              type="submit"
              className="w-[60%] md:w-[45%] mx-auto bg-[#313053] hover:bg-[#615fa1] rounded-md text-white px-4 py-2 border-none font-semibold uppercase mt-2 cursor-pointer transition-colors duration-300"
              disabled={isLoading}
            >
              {isLoading ? "Signing In..." : "Sign In"}
            </button>
            <button
              type="button"
              className="w-[60%] md:w-[45%] mx-auto bg-[#313053] hover:bg-[#615fa1] rounded-md text-white px-4 py-2 border-none font-semibold uppercase mt-2 cursor-pointer transition-colors duration-300 whitespace-nowrap"
              disabled={isLoading}
            >
              Forgot Password
            </button>
          </form>
        </div>
        <div
          className="hidden md:block absolute top-0 right-0 w-1/2 h-full overflow-hidden transition-all duration-1000 ease-out z-[1000]"
          style={{ borderRadius: "150px 0 0 100px" }}
        >
          <div
            className="toggle h-full bg-[#313053] text-white flex relative left-0 w-full"
            style={{ transform: "translateX(0)" }}
          >
            <div className="toggle-panel toggle-right w-full h-full flex flex-col justify-center items-center p-6 text-center">
              <div className="text-3xl font-semibold mb-4 flex items-center justify-center">
                <AnimatedText text="Hello, Friend!" />
                <span className="animate-wave ml-2">👋</span>
              </div>
              <p className="text-sm mb-6 leading-relaxed">
                Register with your personal details to use all features in our
                site
              </p>
              <button
                onClick={() => router.push("/auth/signup")}
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
          font-size: 1.25rem;
          line-height: 1;
        }
        .animate-char {
          display: inline-block;
          animation: charFade 0.5s ease-out forwards;
        }
        .custom-toast {
          display: flex;
          align-items: center;
          min-width: 200px;
          max-width: 300px;
          padding: 10px 14px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          font-size: 13px;
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
          font-size: 14px;
          margin-right: 8px;
        }
        .custom-toast-error {
          background: linear-gradient(135deg, #f87171, #ef4444);
        }
        .custom-toast-error::before {
          content: "✖";
          font-size: 14px;
          margin-right: 8px;
        }
        .custom-toast[aria-hidden="true"] {
          animation: popupSlideOut 0.3s ease-in forwards;
        }
        .placeholder-center::placeholder {
          text-align: center;
        }
        @media (min-width: 1280px) {
          .container {
            max-width: 960px;
          }
        }
      `}</style>
    </div>
  );
};

export default SignIn;

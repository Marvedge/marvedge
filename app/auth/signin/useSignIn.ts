import { useState, useRef, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";

const signInSchema = z.object({
  email: z.string().min(1, "Please enter your email").email("Invalid email address"),
  password: z.string().min(1, "Please enter your password"),
});

export const useSignIn = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [animatePanel, setAnimatePanel] = useState(false);
  const router = useRouter();
  const { update } = useSession();

  useEffect(() => {
    const timeout = setTimeout(() => setAnimatePanel(true), 100);
    return () => clearTimeout(timeout);
  }, []);

  const togglePasswordVisibility = () => setShowPassword(!showPassword);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const email = emailRef.current?.value ?? "";
    const password = passwordRef.current?.value ?? "";
    // console.log(email, password, "first");
    setIsLoading(true);

    try {
      // ✅ Validate input
      signInSchema.parse({ email, password });
      // console.log(email, password);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
        setIsLoading(false);
        return;
      }
    }

    try {
      // ✅ Sign in with credentials
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      // console.log(email, password);
      console.log("Sign-in response:", res);

      if (res?.ok) {
        toast.success("Signed in successfully!");
        await update(); // refresh session

        const params = new URLSearchParams(window.location.search);
        let callbackUrl = params.get("callbackUrl") ?? "/dashboard";
        if (!callbackUrl.startsWith("/")) {
          try {
            const url = new URL(callbackUrl);
            callbackUrl =
              url.origin === window.location.origin ? url.pathname + url.search : "/dashboard";
          } catch {
            callbackUrl = "/dashboard";
          }
        }
        router.push(callbackUrl); // ✅ redirect to where the user came from
      } else {
        toast.error(res?.error || "Invalid credentials.");
      }
    } catch (err) {
      console.log("error from the new catch block");
      console.error("Sign-in error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    showPassword,
    togglePasswordVisibility,
    isLoading,
    animatePanel,
    emailRef,
    passwordRef,
    router,
    handleSubmit,
  };
};

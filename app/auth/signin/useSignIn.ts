import { useState, useRef, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";

const signInSchema = z.object({
  email: z.string().min(1, "Please enter your email").email("Invalid email address"),
  password: z.string().min(1, "Please enter your password"),
});

const INVALID_CREDENTIALS_ERROR = "Invalid email or password";
const AUTH_SERVICE_ERROR = "Unable to sign in. Please try again later.";

function safeSignInError(error: string | null | undefined): string {
  return error === INVALID_CREDENTIALS_ERROR ? INVALID_CREDENTIALS_ERROR : AUTH_SERVICE_ERROR;
}

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
    if (isLoading) {
      return;
    }
    // Trim email so login matches signup, leave password raw.
    const email = (emailRef.current?.value ?? "").trim();
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
        await update();

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

        router.push(callbackUrl);
      } else {
        toast.error(safeSignInError(res?.error));
      }
    } catch {
      toast.error(AUTH_SERVICE_ERROR);
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

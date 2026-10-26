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

/** Fallback destination when `callbackUrl` is missing or unsafe. */
export const SIGN_IN_FALLBACK_URL = "/dashboard";

/**
 * Allow only same-origin paths: exactly one leading `/` (reject `//`,
 * backslash-prefixed, protocol-relative and absolute URLs, and control
 * characters). Anything else falls back to {@link SIGN_IN_FALLBACK_URL}.
 */
export function getSafeCallbackUrl(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) {
    return SIGN_IN_FALLBACK_URL;
  }
  const value = raw.trim();
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\") ||
    value.includes("\\") ||
    /[\s\x00-\x1f\x7f]/.test(value)
  ) {
    return SIGN_IN_FALLBACK_URL;
  }
  return value;
}

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
        const callbackUrl = getSafeCallbackUrl(params.get("callbackUrl"));

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

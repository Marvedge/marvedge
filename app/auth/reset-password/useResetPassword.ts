import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import axios from "axios";

const resetPasswordSchema = z
  .object({
    email: z.string().min(1, "Please enter your email").email("Invalid email address"),
    token: z.string().min(1, "Invalid reset token"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const useResetPassword = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [animatePanel, setAnimatePanel] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const timer = setTimeout(() => setAnimatePanel(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Pre-fill email if passed as query param
  useEffect(() => {
    const email = searchParams.get("email");
    if (email && emailRef.current) {
      emailRef.current.value = email;
    }
  }, [searchParams]);

  const togglePassword = () => setShowPassword(!showPassword);
  const toggleConfirm = () => setShowConfirmPassword(!showConfirmPassword);

  const handleReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = {
      email: emailRef.current?.value.trim(),
      token: searchParams.get("token") || "",
      password: passwordRef.current?.value,
      confirmPassword: confirmPasswordRef.current?.value,
    };
    try {
      const validated = resetPasswordSchema.parse(formData);
      const res = await axios.post("/api/auth/verify-reset", validated);
      if (res.status === 200) {
        toast.success("Password reset successfully!");
        setTimeout(() => router.push("/auth/signin"), 1500);
      }
    } catch (err) {
      const message =
        err instanceof z.ZodError
          ? err.errors[0].message
          : (axios.isAxiosError(err) && err.response?.data?.error) || "Reset failed.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    showPassword,
    togglePassword,
    showConfirmPassword,
    toggleConfirm,
    isLoading,
    animatePanel,
    emailRef,
    passwordRef,
    confirmPasswordRef,
    handleReset,
  };
};

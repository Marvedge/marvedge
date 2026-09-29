import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";

const signUpSchema = z
  .object({
    name: z.string().min(1, "Please enter your name"),
    email: z.string().min(1, "Please enter your email").email("Invalid email address"),

    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be under 72 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const useSignUp = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [animatePanel, setAnimatePanel] = useState(false);

  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email") || "";
  const nameFromQuery = searchParams.get("name") || "";
  const [email, setEmail] = useState(emailFromQuery);
  const [name, setName] = useState(nameFromQuery);

  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => setAnimatePanel(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const togglePassword = () => setShowPassword(!showPassword);
  const toggleConfirm = () => setShowConfirmPassword(!showConfirmPassword);

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    // Trim name and email, leave passwords raw.
    const formData = {
      name: name.trim(),
      email: email.trim(),
      password: passwordRef.current?.value,
      confirmPassword: confirmPasswordRef.current?.value,
    };
    try {
      const validated = signUpSchema.parse(formData);
      const res = await axios.post("/api/auth/signup", validated);
      if (res.status === 201 || res.status === 200) {
        toast.success("Account created successfully!");
        router.push("/auth/signin");
      }
    } catch (err) {
      // Show server message for duplicate email so user sees the real cause.
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      } else if (
        axios.isAxiosError(err) &&
        err.response?.status === 400 &&
        typeof err.response?.data?.error === "string"
      ) {
        toast.error(err.response.data.error);
      } else {
        toast.error("Sign-up failed.");
      }
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
    email,
    setEmail,
    name,
    setName,
    passwordRef,
    confirmPasswordRef,
    router,
    handleSignUp,
  };
};

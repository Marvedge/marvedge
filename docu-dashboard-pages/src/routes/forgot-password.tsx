import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/public/auth";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/forgot-password")({ head: () => pageHead("Forgot password", "Request a secure password reset link for your Marvedge account."), component: () => <AuthPage mode="forgot" /> });
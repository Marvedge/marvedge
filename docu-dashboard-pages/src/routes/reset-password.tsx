import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/public/auth";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/reset-password")({ head: () => pageHead("Reset password", "Set a new password for your Marvedge account using your secure recovery link."), component: () => <AuthPage mode="reset" /> });
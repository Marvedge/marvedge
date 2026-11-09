import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/public/auth";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/auth")({ head: () => pageHead("Sign in", "Sign in to your Marvedge creative workspace with email or Google."), component: () => <AuthPage mode="signin" /> });
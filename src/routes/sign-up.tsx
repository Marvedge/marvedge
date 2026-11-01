import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/public/auth";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/sign-up")({ head: () => pageHead("Create an account", "Create your Marvedge account and personal profile to start your next project."), component: () => <AuthPage mode="signup" /> });
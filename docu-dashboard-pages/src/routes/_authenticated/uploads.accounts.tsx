import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/uploads/accounts")({
  beforeLoad: () => {
    throw redirect({ to: "/create", search: { tab: "accounts" } });
  },
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, useCallback, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AccountProvider, type AccountProfile } from "@/lib/account";
import { ThemeProvider } from "@/lib/theme";

import appCss from "../styles.css?url";
import { WorkspaceProvider } from "@/lib/workspace";
import { Toaster } from "@/components/ui/sonner";
import { WorkspaceShell } from "@/components/workspace/shell";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Marvedge Workspace" },
      {
        name: "description",
        content:
          "Create interactive product demos and short-form videos in your Marvedge workspace.",
      },
      { name: "author", content: "Marvedge" },
      { property: "og:title", content: "Marvedge Workspace" },
      {
        property: "og:description",
        content:
          "Create interactive product demos and short-form videos in your Marvedge workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;450;500;550;600;650;700;750;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    if (data.user) {
      const result = await supabase.from("profiles").select("display_name, avatar_url").eq("id", data.user.id).single();
      setAccountProfile(result.data);
    } else setAccountProfile(null);
    setLoading(false);
  }, []);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED" && event !== "PASSWORD_RECOVERY") return;
      if (event === "SIGNED_OUT") { setUser(null); setAccountProfile(null); }
      else setTimeout(() => { void refreshProfile(); }, 0);
      void router.invalidate();
      if (event !== "SIGNED_OUT") void queryClient.invalidateQueries();
    });
    void refreshProfile();
    return () => subscription.unsubscribe();
  }, [router, queryClient, refreshProfile]);
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) return;
    await router.navigate({ to: "/auth", replace: true });
  }
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isolated = ["/", "/auth", "/sign-up", "/forgot-password", "/reset-password"].includes(pathname) || ["/editor/", "/preview/", "/export/"].some((prefix) =>
    pathname.startsWith(prefix),
  );

  return (
    <ThemeProvider><QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <WorkspaceProvider><WorkspaceShell><Outlet /></WorkspaceShell></WorkspaceProvider> breaks all child routes. */}
      <AccountProvider value={{ user, profile: accountProfile, loading, refreshProfile, signOut }}>
      <WorkspaceProvider key={user?.id ?? "signed-out"}>
        {isolated ? (
          <Outlet />
        ) : (
          <WorkspaceShell>
            <Outlet />
          </WorkspaceShell>
        )}
        <Toaster />
      </WorkspaceProvider>
      </AccountProvider>
    </QueryClientProvider></ThemeProvider>
  );
}

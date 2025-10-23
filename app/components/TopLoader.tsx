"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import NProgress from "nprogress";
import "nprogress/nprogress.css";

NProgress.configure({ showSpinner: false, trickleSpeed: 100 });

export default function TopLoader() {
  const pathname = usePathname();
  const router = useRouter();
  const isInitializedRef = useRef(false);

  // Intercept programmatic navigations (router.push, router.replace)
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    try {
      const originalPush = router.push;
      const originalReplace = router.replace;

      router.push = (...args: Parameters<typeof router.push>) => {
        NProgress.start();
        return originalPush.apply(router, args);
      };

      router.replace = (...args: Parameters<typeof router.replace>) => {
        NProgress.start();
        return originalReplace.apply(router, args);
      };

      return () => {
        router.push = originalPush;
        router.replace = originalReplace;
      };
    } catch (error) {
      console.error("TopLoader initialization error:", error);
    }
  }, [router]);

  // Normal <a>/<Link> clicks → start progress
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (target && target.href?.startsWith(window.location.origin)) {
        NProgress.start();
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // Stop when route actually changes (after render)
  useEffect(() => {
    if (!pathname) return;
    const timer = setTimeout(() => {
      NProgress.done();
    }, 200);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}

/*
// Now 
Bar should start immediately when a <Link> is clicked.
Bar should end when React finishes rendering 

Adds a global listener for <Link> clicks → starts bar instantly on user action.

While React is rendering (isPending), keep the bar running.

When React finishes, stop the bar (done).
*/

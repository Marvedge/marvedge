"use client";

import { useEffect, useTransition } from "react";
import { usePathname } from "next/navigation";
import NProgress from "nprogress";
import "nprogress/nprogress.css";

NProgress.configure({ showSpinner: false });

export default function TopLoader() {
  const pathname = usePathname();
  const [isPending] = useTransition();

  useEffect(() => {
    // Add a global click listener for <a>/<Link>
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (target && target.href?.startsWith(window.location.origin)) {
        // Start progress immediately on link click
        NProgress.start();
      }
    };

    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, []);

  useEffect(() => {
    if (isPending) {
      NProgress.start();
    } else {
      NProgress.done();
    }
  }, [isPending, pathname]);

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

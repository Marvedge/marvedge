"use client";

import { Toaster } from "sonner";

export function SonnerToaster() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      expand
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "relative bg-[#2D2A3A] text-white font-bold text-lg rounded-xl shadow-lg z-[99999]",
          success: "bg-green-500 text-white",
          error: "bg-red-500 text-white",
          // keep the X at the top-right and make it easy to click
          closeButton:
            "absolute right-2 top-2 rounded-md p-1 outline-none hover:opacity-100 focus-visible:ring-2",
        },
      }}
    />
  );
}

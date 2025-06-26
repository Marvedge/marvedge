"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Navbar from "../app/components/Navbar";
import { useAnimationControls } from "framer-motion";

export default function Home() {
  const { status } = useSession();
  const router = useRouter();
  const controls = useAnimationControls();

  useEffect(() => {
    console.log("current status", status);
    const animateLoop = async () => {
      await controls.start("visible");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await controls.start("hidden");
      animateLoop();
    };
    animateLoop();
    return () => controls.stop();
  }, [status, router, controls]);

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <Navbar />
    </div>
  );
}

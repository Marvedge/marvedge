"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Navbar from "../app/components/Navbar";

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    console.log("current status", status);

    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (status === "loading" || status === "authenticated") {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <Navbar />
    </div>
  );
}

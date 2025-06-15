"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  //Do redirect from here if user tries manually going to this page through URL after signing in

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
      Not signed in
      <button onClick={() => router.push("/auth/signin")}>Sign in</button>
    </div>
  );
}

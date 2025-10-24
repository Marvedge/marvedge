"use client";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import Navbar from "../app/components/Navbar";
import HeroSection from "./components/HeroSection";
import Footer from "./components/Footer";

export default function LandingPage() {
  const { status } = useSession();

  useEffect(() => {
    console.log("current status", status);
  }, [status]);

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <Navbar />
      <HeroSection />
      <Footer />
    </div>
  );
}

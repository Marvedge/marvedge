import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/lib/auth/options";
import Navbar from "../app/components/Navbar";
import HeroSection from "./components/HeroSection";
import Footer from "./components/Footer";
import Pricing from "./components/Pricing";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <>
      <Navbar />
      <HeroSection />
      <Pricing />
      <Footer />
    </>
  );
}

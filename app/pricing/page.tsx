import Navbar from "../components/Navbar";
import Pricing from "../components/Pricing";
import Footer from "../components/Footer";
import { Suspense } from "react";

export default function PricingPage() {
  return (
    <div className="bg-[#F3F0FC]">
      <Navbar />
      <div className="pt-20">
        <Suspense fallback={<div>Loading pricing...</div>}>
          <Pricing />
        </Suspense>
      </div>
      <Footer />
    </div>
  );
}

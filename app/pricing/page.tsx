import Navbar from "../components/Navbar";
import Pricing from "../components/Pricing";
import Footer from "../components/Footer";

export default function PricingPage() {
  return (
    <div className="bg-[#F3F0FC]">
      <Navbar />
      <div className="pt-20">
        <Pricing />
      </div>
      <Footer />
    </div>
  );
}

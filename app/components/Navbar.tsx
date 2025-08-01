"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Menu, X, Bell } from "lucide-react";
import Hero from "./Hero";
import { useSession } from "next-auth/react";

const NavButton: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}> = ({ children, onClick, className = "" }) => (
  <button
    onClick={onClick}
    className={`text-[#313053] hover:text-[#615fa1] cursor-pointer text-lg font-semibold transition ${className}`}
  >
    {children}
  </button>
);

const Navbar: React.FC = () => {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { status } = useSession();

  const toggleMenu = () => {
    setIsMenuOpen((prev) => !prev);
  };

  const handleActionButtonClick = () => {
    if (status === "authenticated") {
      router.push("/dashboard");
    } else {
      router.push("/auth/signup");
    }
  };

  const actionButtonText =
    status === "authenticated" ? "Go To Dashboard" : "Start Free Trial";

  return (
    <>
      <nav className="fixed top-0 left-0 w-full z-[1002] bg-gradient-to-tr from-white via-[#f9fef4] to-[#e9f8c5] min-h-[80px] flex flex-col justify-start">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full">
          {/* Top Row: Logo, Marvedge text, Hamburger */}
          <div className="flex items-center justify-between w-full pt-2">
            <div className="flex items-center space-x-3">
              <Image
                src="/images/Transparent logo.png"
                alt="Marvedge logo"
                width={80}
                height={80}
                className="w-12 h-12 md:w-16 md:h-16 object-contain"
                priority
              />
              <span className="text-[#8C5BFF] text-xl md:text-2xl font-semibold">
                Marvedge
              </span>
            </div>
            <button
              onClick={toggleMenu}
              className="md:hidden text-[#313053] focus:outline-none focus:ring-2 focus:ring-[#8C5BFF] p-2"
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
          {/* Second Row: Bell and Avatar, right-aligned */}
        </div>
        {/* Desktop nav links (unchanged) */}
        <div className="hidden md:flex items-center space-x-8 text-[#313053] font-medium absolute right-8 top-6">
          <NavButton onClick={() => router.push("/features")}>
            Features
          </NavButton>
          <NavButton onClick={() => router.push("/pricing")}>Pricing</NavButton>
          <NavButton onClick={() => router.push("/reviews")}>Reviews</NavButton>
          <NavButton
            onClick={handleActionButtonClick}
            className="bg-[#8C5BFF] text-white px-4 py-2 rounded-md hover:bg-[#7b4de5] transition-colors"
          >
            {actionButtonText}
          </NavButton>
        </div>
        {/* Mobile menu (unchanged) */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-[80px] left-0 w-full bg-gradient-to-tr from-gray-100 via-[#e6f0e1] to-[#d1e8a3] z-[1001] flex flex-col items-start p-4 space-y-3 shadow-md">
            <NavButton
              onClick={() => {
                router.push("/features");
                toggleMenu();
              }}
            >
              Features
            </NavButton>
            <NavButton
              onClick={() => {
                router.push("/pricing");
                toggleMenu();
              }}
            >
              Pricing
            </NavButton>
            <NavButton
              onClick={() => {
                router.push("/reviews");
                toggleMenu();
              }}
            >
              Reviews
            </NavButton>
            <NavButton
              onClick={() => {
                handleActionButtonClick();
                toggleMenu();
              }}
              className="bg-[#8C5BFF] text-white px-4 py-2 rounded-md hover:bg-[#7b4de5] transition-colors"
            >
              {actionButtonText}
            </NavButton>
          </div>
        )}
      </nav>
      <Hero />
    </>
  );
};

export default Navbar;

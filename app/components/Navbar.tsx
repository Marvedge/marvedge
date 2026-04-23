"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu, X } from "lucide-react";
// import Hero from "./Hero";

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
  const { status } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen((prev) => !prev);
  };

  const handleLogoClick = () => {
    if (status === "authenticated") {
      router.push("/dashboard");
      return;
    }
    router.push("/");
  };

  return (
    <>
      <nav className="fixed top-0 left-0 w-full z-50 bg-white min-h-20 flex flex-col justify-start">
        <div className="px-4 sm:px-6 w-full">
          {/* Top Row: Logo, Marvedge text, Hamburger */}
          <div className="flex items-center justify-between w-full pt-2">
            <button
              type="button"
              onClick={handleLogoClick}
              className="flex items-center space-x-3 cursor-pointer"
              aria-label="Go to dashboard"
            >
              <Image
                src="/images/Transparent logo.png"
                alt="Marvedge logo"
                width={80}
                height={80}
                className="w-12 h-12 md:w-16 md:h-16 object-contain"
                priority
              />
              <span className="text-[#8C5BFF] text-xl md:text-2xl font-semibold">Marvedge</span>
            </button>
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
        {/* Desktop nav links */}
        <div className="hidden md:flex items-center space-x-8 text-[#313053] font-medium absolute right-8 top-6">
          <NavButton
            onClick={() => {
              if (window.location.pathname === "/") {
                document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
              } else {
                router.push("/#features");
              }
            }}
          >
            Features
          </NavButton>
          <NavButton
            onClick={() => {
              if (window.location.pathname === "/") {
                document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
              } else {
                router.push("/#pricing");
              }
            }}
          >
            Pricing
          </NavButton>
          <NavButton onClick={() => router.push("/reviews")}>Reviews</NavButton>
        </div>
        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-20 left-0 w-full bg-white z-40 flex flex-col items-start p-4 space-y-3 shadow-md">
            <NavButton
              onClick={() => {
                if (window.location.pathname === "/") {
                  document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
                } else {
                  router.push("/#features");
                }
                toggleMenu();
              }}
            >
              Features
            </NavButton>
            <NavButton
              onClick={() => {
                if (window.location.pathname === "/") {
                  document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
                } else {
                  router.push("/#pricing");
                }
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
          </div>
        )}
      </nav>
    </>
  );
};

export default Navbar;

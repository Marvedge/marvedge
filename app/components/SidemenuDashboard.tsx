"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Play, Settings, Clock, Share2 } from "lucide-react";
import Image from "next/image";

const SidemenuDashboard = () => {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    return pathname === path;
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const activeClass = "bg-[#bcb3f7] text-white font-light rounded-lg shadow-sm";
  const inactiveClass = "text-white font-light hover:bg-[#bcb3f7] rounded-lg";

  return (
    <>
      <button
        onClick={toggleMobileMenu}
        className="md:hidden fixed top-3 sm:top-4 left-3 sm:left-4 z-40 bg-[#6356d7] text-white p-1.5 sm:p-2 rounded-md shadow-lg"
        aria-label="Toggle menu"
      >
        <Menu size={20} className="sm:w-6 sm:h-6" />
      </button>

      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={closeMobileMenu}
        />
      )}

      <div
        className={`w-56 sm:w-64 md:w-72 h-screen bg-[#6356d7] text-white p-3 sm:p-6 fixed top-0 left-0 z-30 overflow-y-auto transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <button
          onClick={closeMobileMenu}
          className="md:hidden absolute top-2 sm:top-4 right-2 sm:right-4 text-white hover:text-gray-300"
          aria-label="Close menu"
        >
          <X size={20} className="sm:w-6 sm:h-6" />
        </button>

        <div
          className="flex cursor-pointer items-center justify-center gap-2 sm:gap-3 mb-4 sm:mb-6 mt-8 sm:mt-0"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          <Image
            src="/images/Transparent logo.png"
            alt="Marvedge logo"
            width={32}
            height={32}
            className="object-contain brightness-0 invert sm:w-10 sm:h-10"
            priority
          />
          <h2 className="text-lg sm:text-2xl h-full flex items-center text-white font-light">
            MARVEDGE
          </h2>
        </div>
        <Link href="/recorder" onClick={closeMobileMenu}>
          <button className="w-full bg-white cursor-pointer text-purple-900 py-1.5 sm:py-2 rounded-[15px] mb-4 sm:mb-6 flex items-center justify-center gap-1 sm:gap-2 shadow-md text-xs sm:text-base hover:bg-gray-100 transition-colors">
            <Image
              src="/material-symbols_add-rounded.png"
              alt="Add"
              width={20}
              height={20}
              className="sm:w-6 sm:h-6"
            />{" "}
            <span className="hidden sm:inline text-black font-bold">Create Demo</span>{" "}
            <span className="sm:hidden font-bold">Create</span>
          </button>
        </Link>
        <ul className="space-y-1 sm:space-y-2 text-sm sm:text-lg font-light">
          <Link href="/dashboard" onClick={closeMobileMenu}>
            <li
              className={`flex items-center justify-start gap-1 sm:gap-3 h-8 sm:h-10 px-1 sm:px-2 transition-colors cursor-pointer text-xs sm:text-base ${
                isActive("/dashboard") ? activeClass : inactiveClass
              }`}
            >
              <span className="flex items-center justify-center shrink-0 w-5 sm:w-7">
                <Image
                  src="/icons/dash-home.svg"
                  alt="Dashboard"
                  width={22}
                  height={22}
                  className="object-contain sm:w-[30px] sm:h-[30px]"
                  priority
                />
              </span>
              <span>Dashboard</span>
            </li>
          </Link>
          <Link href="/demos" onClick={closeMobileMenu}>
            <li
              className={`flex items-center justify-start gap-1 sm:gap-3 h-8 sm:h-10 px-1 sm:px-2 transition-colors cursor-pointer text-xs sm:text-base ${
                isActive("/demos") ? activeClass : inactiveClass
              }`}
            >
              <span className="flex items-center justify-center shrink-0 w-5 sm:w-7">
                <Image
                  src="/icons/dash-play.svg"
                  alt="Demos"
                  width={22}
                  height={22}
                  className="object-contain sm:w-[30px] sm:h-[30px]"
                  priority
                />
              </span>
              <span>My Demos</span>
            </li>
          </Link>
          <Link href="/exported-videos" onClick={closeMobileMenu}>
            <li
              className={`flex items-center justify-start gap-1 sm:gap-3 h-8 sm:h-10 px-1 sm:px-2 transition-colors cursor-pointer text-xs sm:text-base ${
                isActive("/exported-videos") ? activeClass : inactiveClass
              }`}
            >
              <span className="flex items-center justify-center shrink-0 w-5 sm:w-7">
                {/* <Image
                  src="/icons/dash-play.svg"
                  alt="Exported Videos"
                  width={22}
                  height={22}
                  className="object-contain sm:w-[30px] sm:h-[30px]"
                  priority
                /> */}
                <Share2 />
              </span>
              <span>Shared Videos</span>
            </li>
          </Link>
          <Link href="/templates" onClick={closeMobileMenu}>
            {/* <li
              className={`flex items-center justify-start gap-1 sm:gap-3 h-8 sm:h-10 px-1 sm:px-2 transition-colors cursor-pointer text-xs sm:text-base ${
                isActive("/templates") ? activeClass : inactiveClass
              }`}
            >
              <span className="flex items-center justify-center shrink-0 w-5 sm:w-7">
                <Image
                  src="/icons/dash-file.svg"
                  alt="Templates"
                  width={22}
                  height={22}
                  className="object-contain sm:w-[30px] sm:h-[30px]"
                  priority
                />
              </span>
              <span>Templates</span>
            </li> */}
          </Link>
          <Link href="/analytics" onClick={closeMobileMenu}>
            <li
              className={`flex items-center justify-start gap-1 sm:gap-3 h-8 sm:h-10 px-1 sm:px-2 transition-colors cursor-pointer text-xs sm:text-base ${
                isActive("/analytics") ? activeClass : inactiveClass
              }`}
            >
              <span className="flex items-center justify-center shrink-0 w-5 sm:w-7">
                <Image
                  src="/icons/dash-analytics.svg"
                  alt="Analytics"
                  width={18}
                  height={18}
                  className="sm:w-5 sm:h-5"
                />
              </span>
              <span>Analytics</span>
            </li>
          </Link>
          <Link href="/team" onClick={closeMobileMenu}>
            {/* <li
              className={`flex items-center justify-start gap-1 sm:gap-3 h-8 sm:h-10 px-1 sm:px-2 transition-colors cursor-pointer text-xs sm:text-base ${
                isActive("/team") ? activeClass : inactiveClass
              }`}
            >
              <span className="flex items-center justify-center shrink-0 w-5 sm:w-7">
                <Image
                  src="/ant-design_team-outlined.png"
                  alt="Team"
                  width={22}
                  height={22}
                  className="object-contain sm:w-[30px] sm:h-[30px] brightness-0 invert"
                  priority
                />
              </span>
              <span>Team</span>
            </li> */}
          </Link>
          <Link href="/settings" onClick={closeMobileMenu}>
            <li
              className={`flex items-center justify-start gap-1 sm:gap-3 h-8 sm:h-10 px-1 sm:px-2 transition-colors cursor-pointer text-xs sm:text-base ${
                isActive("/settings") ? activeClass : inactiveClass
              }`}
            >
              <span className="flex items-center justify-center shrink-0 w-5 sm:w-7">
                <Settings color="#fff" size={18} className="sm:w-5 sm:h-5" />
              </span>
              <span>Settings</span>
            </li>
          </Link>
        </ul>
        <div className="mt-4 sm:mt-8">
          <Link href="/demos" onClick={closeMobileMenu}>
            <h3
              className={`h-8 sm:h-10 text-xs sm:text-lg font-light flex items-center justify-start gap-1 sm:gap-5 pl-1 sm:pl-2 cursor-pointer transition-colors rounded-lg ${isActive("/demos") ? "bg-[#bcb3f7] text-white" : "text-white hover:bg-[#bcb3f7]"}`}
            >
              <span className="flex items-center justify-center shrink-0 w-5 sm:w-7">
                <Clock color="#fff" size={14} className="sm:w-5 sm:h-5" />
              </span>
              <span>RECENT</span>
            </h3>
          </Link>
          <ul className="space-y-0.5 sm:space-y-1 text-xs sm:text-base font-light">
            <li className="w-full h-8 sm:h-10 cursor-pointer rounded hover:bg-[#bcb3f7] flex items-center justify-start gap-1 sm:gap-3 px-1 sm:px-2 text-white font-light transition-colors text-xs sm:text-base">
              <span className="flex items-center justify-center shrink-0 w-5 sm:w-7">
                <Play color="#fff" size={14} className="sm:w-5 sm:h-5" />
              </span>
              <span className="truncate">Product Onboarding</span>
            </li>
            <li className="w-full h-8 sm:h-10 cursor-pointer rounded hover:bg-[#bcb3f7] flex items-center justify-start gap-1 sm:gap-3 px-1 sm:px-2 text-white font-light transition-colors text-xs sm:text-base">
              <span className="flex items-center justify-center shrink-0 w-5 sm:w-7">
                <Play color="#fff" size={14} className="sm:w-5 sm:h-5" />
              </span>
              <span className="truncate">Feature Walkthrough</span>
            </li>
            <li className="w-full h-8 sm:h-10 cursor-pointer rounded hover:bg-[#bcb3f7] flex items-center justify-start gap-1 sm:gap-3 px-1 sm:px-2 text-white font-light transition-colors text-xs sm:text-base">
              <span className="flex items-center justify-center shrink-0 w-5 sm:w-7">
                <Play color="#fff" size={14} className="sm:w-5 sm:h-5" />
              </span>
              <span className="truncate">Sales Demo</span>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
};

export default SidemenuDashboard;

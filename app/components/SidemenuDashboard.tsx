"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Play, Users, Settings, Clock } from "lucide-react";
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

  const activeClass = "bg-[#bcb3f7] text-white font-normal rounded-lg shadow-sm";
  const inactiveClass = "text-purple-200 font-normal hover:bg-[#bcb3f7] rounded-lg";

  return (
    <>
      <button
        onClick={toggleMobileMenu}
        className="md:hidden fixed top-4 left-4 z-40 bg-[#6356d7] text-white p-2 rounded-md shadow-lg"
        aria-label="Toggle menu"
      >
        <Menu size={24} />
      </button>

      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={closeMobileMenu}
        />
      )}

      <div
        className={`w-64 h-screen bg-[#6356d7] text-white p-6 fixed top-0 left-0 z-30 overflow-y-auto transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <button
          onClick={closeMobileMenu}
          className="md:hidden absolute top-4 right-4 text-white hover:text-gray-300"
          aria-label="Close menu"
        >
          <X size={24} />
        </button>

        <div
          className="flex cursor-pointer items-center justify-center gap-3 mb-6 mt-8 md:mt-0"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          <Image
            src="/images/Transparent logo.png"
            alt="Marvedge logo"
            width={40}
            height={40}
            className="object-contain brightness-0 invert"
            priority
          />
          <h2 className="text-2xl h-full flex items-center text-white">MARVEDGE</h2>
        </div>
        <Link href="/recorder" onClick={closeMobileMenu}>
          <button className="w-full bg-white cursor-pointer text-purple-900 font-semibold py-2 rounded mb-6 flex items-center justify-center gap-2 shadow-md">
            <span className="text-4xl leading-none font-light text-purple-900">+</span> Create Demo
          </button>
        </Link>
        <ul className="space-y-2 text-lg">
          <Link href="/dashboard" onClick={closeMobileMenu}>
            <li
              className={`flex items-center gap-3 h-10 px-2 transition-colors cursor-pointer ${
                isActive("/dashboard") ? activeClass : inactiveClass
              }`}
            >
              <span className="mr-2 flex items-center justify-center">
                <Image
                  src="/icons/dash-home.svg"
                  alt="Marvedge logo"
                  width={30}
                  height={30}
                  className="object-contain"
                  priority
                />
              </span>
              <span className="flex items-center h-full -ml-2">Dashboard</span>
            </li>
          </Link>
          <Link href="/demos" onClick={closeMobileMenu}>
            <li
              className={`flex items-center gap-3 h-10 px-2 transition-colors cursor-pointer ${
                isActive("/demos") ? activeClass : inactiveClass
              }`}
            >
              <span className="mr-2 flex items-center justify-center">
                <Image
                  src="/icons/dash-play.svg"
                  alt="Marvedge logo"
                  width={30}
                  height={30}
                  className="object-contain"
                  priority
                />
              </span>
              <span className="flex items-center h-full -ml-2">My Demos</span>
            </li>
          </Link>
          <Link href="/templates" onClick={closeMobileMenu}>
            <li
              className={`flex items-center gap-3 h-10 px-2 transition-colors cursor-pointer ${
                isActive("/templates") ? activeClass : inactiveClass
              }`}
            >
              <span className="mr-2 flex items-center justify-center">
                <Image
                  src="/icons/dash-file.svg"
                  alt="Marvedge logo"
                  width={30}
                  height={30}
                  className="object-contain"
                  priority
                />
              </span>
              <span className="flex items-center h-full -ml-2">Templates</span>
            </li>
          </Link>
          <Link href="/analytics" onClick={closeMobileMenu}>
            <li
              className={`flex items-center gap-3 h-10 px-2 transition-colors cursor-pointer ${
                isActive("/analytics") ? activeClass : inactiveClass
              }`}
            >
              <span className="mr-2 flex items-center justify-center">
                <Image
                  src="/icons/dash-analytics.svg"
                  alt="Notifications"
                  width={20}
                  height={20}
                  className="w-5 h-5 sm:w-6 sm:h-6"
                />{" "}
              </span>
              <span className="flex items-center h-full -ml-1">Analytics</span>
            </li>
          </Link>
          <Link href="/team" onClick={closeMobileMenu}>
            <li
              className={`flex items-center gap-3 h-10 px-2 transition-colors cursor-pointer ${
                isActive("/team") ? activeClass : inactiveClass
              }`}
            >
              <span className="mr-2 flex items-center justify-center">
                <Users color="#fff" size={20} />
              </span>
              <span className="flex items-center h-full">Team</span>
            </li>
          </Link>
          <Link href="/settings" onClick={closeMobileMenu}>
            <li
              className={`flex items-center gap-3 h-10 px-2 transition-colors cursor-pointer ${
                isActive("/settings") ? activeClass : inactiveClass
              }`}
            >
              <span className="mr-2 flex items-center justify-center">
                <Settings color="#fff" size={20} />
              </span>
              <span className="flex items-center h-full">Settings</span>
            </li>
          </Link>
        </ul>
        <div className="mt-8">
          <Link href="/demos" onClick={closeMobileMenu}>
            <h3
              className={`h-10 text-lg font-extralight flex items-center gap-5 pl-2 cursor-pointer transition-colors rounded-lg ${isActive("/demos") ? "bg-[#bcb3f7] text-white" : "text-gray-300 hover:bg-[#bcb3f7]"}`}
            >
              <Clock size={20} />
              Recent
            </h3>
          </Link>
          <ul className="space-y-1 text-base font-normal">
            <li className="w-full h-10 cursor-pointer text-lg rounded hover:bg-[#bcb3f7] flex items-center gap-3 px-2 whitespace-nowrap text-purple-200 font-light transition-colors">
              <span className="mr-2 flex items-center justify-center">
                <Play color="#fff" size={20} />
              </span>
              <span className="flex items-center h-full">Product Onboarding</span>
            </li>
            <li className="w-full h-10 cursor-pointer text-lg rounded hover:bg-[#bcb3f7] flex items-center gap-3 px-2 whitespace-nowrap text-purple-200 font-light transition-colors">
              <span className="mr-2 flex items-center justify-center">
                <Play color="#fff" size={20} />
              </span>
              <span className="flex items-center h-full">Feature Walkthrough</span>
            </li>
            <li className="w-full h-10 cursor-pointer text-lg rounded hover:bg-[#bcb3f7] flex items-center gap-3 px-2 whitespace-nowrap text-purple-200 font-light transition-colors">
              <span className="mr-2 flex items-center justify-center">
                <Play color="#fff" size={20} />
              </span>
              <span className="flex items-center h-full">Sales Demo</span>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
};

export default SidemenuDashboard;

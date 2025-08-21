"use client";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import DashboardMain from "@/app/components/DashboardMain";
import { motion } from "framer-motion";
import Image from "next/image";

const getInitials = (name: string | undefined): string => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const DashboardPage = () => {
  const { data: session } = useSession();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [displayedText, setDisplayedText] = useState("");
  const intervalMs = 150;
  const welcomeText = "Welcome ";
  useEffect(() => {
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex <= welcomeText.length) {
        setDisplayedText(welcomeText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const initials = getInitials(
    (session?.user?.name as string) || (session?.user?.email as string)
  );

  return (
    <div
      className="overflow-y-auto h-full"
      style={{ minHeight: "calc(100vh - 80px)" }}
    >
      <div className="flex flex-col gap-3 md:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white/80 rounded-lg p-3 md:p-4 shadow mb-2 relative">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden md:flex items-center gap-2 ml-4 mr-6">
              <Image
                src="/icons/Vector (1).svg"
                alt="Notifications"
                width={20}
                height={20}
                className="md:w-6 md:h-6"
              />
              <span className="text-lg text-gray-400 font-medium">
                Dashboard
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 md:gap-4 w-full">
            <div className="hidden md:flex justify-center flex-1">
              <input
                type="text"
                placeholder="Search"
                className="px-4 py-2 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#6356D7] bg-white text-gray-700 w-56 shadow-sm transition-all"
              />
            </div>
            <div className="flex flex-col md:flex-row items-start md:items-center ml-4 md:ml-8 w-full md:w-[200px] overflow-hidden">
              <div className="relative w-full md:w-[200px] overflow-hidden">
                <motion.span
                  className="text-gray-500 text-base sm:text-lg mr-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {displayedText}
                </motion.span>
                <motion.span
                  className="text-[#6356D7] font-semibold text-lg sm:text-xl"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: ((welcomeText.length + 1) * intervalMs) / 1000,
                  }}
                >
                  {session?.user?.name
                    ? session.user.name.split(" ")[0]
                    : session?.user?.email || "User"}{" "}
                  <motion.span
                    role="img"
                    aria-label="waving hand"
                    style={{
                      display: "inline-block",
                      originX: 0.7,
                      originY: 0.7,
                    }}
                    animate={{ rotate: [0, 20, -10, 20, 0] }}
                    transition={{
                      duration: 1.5,
                      repeat: 7,
                      repeatType: "loop",
                      ease: "easeInOut",
                      delay:
                        ((welcomeText.length + 1) * intervalMs) / 1000 + 0.5,
                    }}
                  >
                    👋
                  </motion.span>
                </motion.span>
                <span
                  className="absolute top-0 left-0 text-gray-500 text-base mr-2 invisible"
                  aria-hidden="true"
                >
                  {welcomeText}
                  <span className="text-[#6356D7] font-semibold text-base">
                    {session?.user?.name
                      ? session.user.name.split(" ")[0]
                      : session?.user?.email || "User"}{" "}
                    👋
                  </span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <button
                className="relative p-2 rounded-full hover:bg-[#F1ECFF] transition-colors focus:outline-none"
                title="Notifications"
              >
                <Image
                  src="/icons/bell.png"
                  alt="Notifications"
                  width={20}
                  height={20}
                  className="md:w-6 md:h-6"
                />
              </button>
              <div className="relative" ref={dropdownRef}>
                <button
                  className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#6356D7] text-white flex items-center justify-center text-lg md:text-xl font-bold shadow cursor-pointer border-4 border-white hover:scale-105 transition-all"
                  onClick={() => setShowDropdown((v) => !v)}
                  title={
                    session?.user?.name || session?.user?.email || undefined
                  }
                >
                  {initials}
                </button>
                {showDropdown && (
                  <div className="absolute right-0 mt-2 w-56 md:w-64 bg白 rounded-lg shadow-lg p-3 md:p-4 z-50 border border-gray-200 animate-fade-in">
                    <div className="mb-2 text-base md:text-lg font-bold text-[#6356D7]">
                      {session?.user?.name || "User"}
                    </div>
                    <div className="mb-1 text-gray-700 text-xs md:text-sm font-semibold">
                      {session?.user?.email}
                    </div>
                    <button
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="mt-3 md:mt-4 w-full px-3 md:px-4 py-2 bg-[#6356D7] text-white rounded hover:bg-[#7E5FFF] font-semibold transition-all text-sm md:text-base"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <DashboardMain />
      </div>
    </div>
  );
};

export default DashboardPage;

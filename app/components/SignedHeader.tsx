import { useSession, signOut } from "next-auth/react";
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";

interface SignedHeaderProps {
  titleText: string;
  iconSRC: string;
  iconALT: string;
}

const SignedHeader = ({ titleText, iconSRC, iconALT }: SignedHeaderProps) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const { data: session } = useSession();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calculate initials from user's name or email
  const initials = React.useMemo(() => {
    const base = session?.user?.name || session?.user?.email?.split("@")[0] || "User";
    return base
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .join("")
      .slice(0, 2);
  }, [session?.user?.name, session?.user?.email]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <div className="w-full bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-6 md:px-8 py-2.5 sm:py-4 gap-2">
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
          <span className="mr-0 sm:mr-1 flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6">
            <Image
              src={iconSRC}
              alt={iconALT}
              width={20}
              height={20}
              className="w-full h-full object-contain"
              style={{ filter: "invert(0.35) sepia(0.5) saturate(2) hue-rotate(240deg)" }}
              priority
              unoptimized
            />
          </span>
          <span className="text-sm sm:text-base md:text-lg text-gray-400 font-medium truncate">
            {titleText}
          </span>
        </div>

        {/* Removed search bar block */}

        <div className="flex items-center gap-1 sm:gap-2 md:gap-3 min-w-0">
          <div className="relative flex-1 sm:flex-none">
            <input
              type="text"
              placeholder="Search"
              className="bg-gray-100 text-gray-700 placeholder-gray-400 rounded-full py-1.5 sm:py-2 pl-8 sm:pl-10 pr-3 sm:pr-4 w-full sm:w-52 md:w-64 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#7C5CFC] transition-all text-xs sm:text-sm"
            />
            <svg
              className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <span className="hidden sm:inline text-gray-500 text-xs md:text-sm lg:text-lg whitespace-nowrap">
            Welcome{" "}
            <span className="text-[#7C5CFC] font-semibold">
              {session?.user?.name?.split(" ")[0] || session?.user?.email?.split("@")[0] || "User"}
            </span>{" "}
            <span className="inline-block">👋</span>
          </span>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              className="relative p-1 sm:p-2 rounded-full hover:bg-[#F1ECFF] transition-colors focus:outline-none"
              title="Notifications"
            >
              <Image
                src="/icons/bell.png"
                alt="Notifications"
                width={18}
                height={18}
                className="w-4.5 h-4.5 sm:w-6 sm:h-6"
              />
            </button>
            <div className="relative" ref={dropdownRef}>
              <button
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#7C5CFC] text-white flex items-center justify-center text-xs sm:text-lg font-bold shadow cursor-pointer border-2 sm:border-4 border-white hover:scale-105 transition-all"
                onClick={() => setShowDropdown((v) => !v)}
                title={session?.user?.name || session?.user?.email || undefined}
              >
                {initials}
              </button>
              {showDropdown && (
                <div className="absolute right-0 mt-2 w-48 sm:w-56 bg-white rounded-lg shadow-lg p-2 sm:p-3 z-50 border border-gray-200 animate-fade-in">
                  <div className="mb-1 sm:mb-2 text-sm sm:text-base font-bold text-[#6356D7] truncate">
                    {session?.user?.name || "User"}
                  </div>
                  <div className="mb-1 text-gray-700 text-xs font-semibold truncate">
                    {session?.user?.email}
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="mt-2 sm:mt-3 w-full px-2 sm:px-3 py-1.5 sm:py-2 bg-[#6356D7] text-white rounded hover:bg-[#7E5FFF] font-semibold transition-all text-xs sm:text-sm"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SignedHeader;

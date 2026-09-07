import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";

interface UserMenuProps {
  session: Session | null;
  isDark: boolean;
  profileImage: string | null | undefined;
}

const UserMenu = ({ session, isDark, profileImage }: UserMenuProps) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    <div className="relative" ref={dropdownRef}>
      <button
        className={`avatar user-avatar w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-lg font-bold shadow cursor-pointer hover:scale-105 transition-all overflow-hidden ${
          isDark ? "border-none" : "border-2 sm:border-4 border-white"
        }`}
        onClick={() => setShowDropdown((v) => !v)}
        title={session?.user?.name || session?.user?.email || undefined}
        style={
          isDark
            ? { backgroundColor: "#5b3df5", color: "white" }
            : profileImage
              ? {}
              : { backgroundColor: "#7C5CFC", color: "white" }
        }
      >
        {!isDark && profileImage ? (
          <Image
            key={profileImage}
            src={profileImage}
            alt="Profile"
            width={40}
            height={40}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          initials
        )}
      </button>
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-48 sm:w-56 bg-white dark:bg-[#070611] rounded-lg shadow-lg p-2 sm:p-3 z-50 border border-gray-200 dark:border-[rgba(255,255,255,0.08)] animate-fade-in">
          <div className="mb-1 sm:mb-2 text-sm sm:text-base font-bold text-[#6356D7] dark:text-[#7c69ff] truncate">
            {session?.user?.name || "User"}
          </div>
          <div className="mb-1 text-gray-700 dark:text-gray-300 text-xs font-semibold truncate">
            {session?.user?.email}
          </div>
          <button
            onClick={() => signOut({ redirect: false }).then(() => window.location.assign("/"))}
            className="mt-2 sm:mt-3 w-full px-2 sm:px-3 py-1.5 sm:py-2 bg-[#6356D7] text-white rounded hover:bg-[#7E5FFF] font-semibold transition-all text-xs sm:text-sm"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;

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
    if (session?.user?.image) {
      return session.user.image;
    }
    return "/icons/status-icon-green.png";
  }, [session?.user]);

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
      <div className="w-full bg-white border-b border-gray-200 flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-3">
          <span className="mr-2">
            <Image src={iconSRC} alt={iconALT} width={24} height={24} className="w-6 h-6" />
          </span>
          <span className="text-lg text-gray-400 font-medium">{titleText}</span>
        </div>

        {/* Removed search bar block */}

        <div className="flex items-center gap-6">
          <span className="text-gray-500 text-lg">
            Welcome{" "}
            <span className="text-[#7C5CFC] font-semibold">
              {session?.user?.name?.split(" ")[0] || session?.user?.email?.split("@")[0] || "User"}
            </span>{" "}
            <span className="inline-block">👋</span>
          </span>
          <button
            className="relative p-2 rounded-full hover:bg-[#F1ECFF] transition-colors focus:outline-none"
            title="Notifications"
          >
            <Image
              src="/icons/bell.png"
              alt="Notifications"
              width={24}
              height={24}
              className="w-6 h-6"
            />
          </button>
          <div className="relative" ref={dropdownRef}>
            <button
              className="w-10 h-10 rounded-full bg-[#7C5CFC] text-white flex items-center justify-center text-lg font-bold shadow cursor-pointer border-4 border-white hover:scale-105 transition-all"
              onClick={() => setShowDropdown((v) => !v)}
              title={session?.user?.name || session?.user?.email || undefined}
            >
              {/* {initials} */}
              <Image src={initials} alt="user_profile" fill className="rounded-full object-cover" />
            </button>
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg p-3 z-50 border border-gray-200 animate-fade-in">
                <div className="mb-2 text-base font-bold text-[#6356D7]">
                  {session?.user?.name || "User"}
                </div>
                <div className="mb-1 text-gray-700 text-xs font-semibold">
                  {session?.user?.email}
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="mt-3 w-full px-3 py-2 bg-[#6356D7] text-white rounded hover:bg-[#7E5FFF] font-semibold transition-all text-sm"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SignedHeader;

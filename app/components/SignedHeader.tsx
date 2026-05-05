import { useSession, signOut } from "next-auth/react";
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";

interface SignedHeaderProps {
  titleText: string;
  iconSRC: string;
  iconALT: string;
  className?: string;
}

const SignedHeader = ({ titleText, iconSRC, iconALT, className }: SignedHeaderProps) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null | undefined>(null);
  const { data: session } = useSession();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchUserImage = async () => {
      try {
        const res = await fetch("/api/user/get", {
          credentials: "include",
        });
        if (!res.ok) {
          setProfileImage(null);
          return;
        }
        const data = await res.json();
        if (data.user?.image && data.user.image.trim()) {
          setProfileImage(data.user.image + `?t=${Date.now()}`);
        } else {
          setProfileImage(null);
        }
      } catch {
        setProfileImage(null);
      }
    };

    if (session?.user) {
      fetchUserImage();
    }
  }, [session]);

  useEffect(() => {
    const handlePhotoUpdate = () => {
      const fetchUserImage = async () => {
        try {
          const res = await fetch("/api/user/get", {
            credentials: "include",
          });
          if (!res.ok) {
            setProfileImage(null);
            return;
          }
          const data = await res.json();
          if (data.user?.image && data.user.image.trim()) {
            setProfileImage(data.user.image + `?t=${Date.now()}`);
          } else {
            setProfileImage(null);
          }
        } catch {
          setProfileImage(null);
        }
      };
      fetchUserImage();
    };

    window.addEventListener("photoUpdated", handlePhotoUpdate);
    return () => window.removeEventListener("photoUpdated", handlePhotoUpdate);
  }, []);

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
      <div
        className={`w-full  bg-white  border-b border-gray-200 flex items-center justify-between px-3 sm:px-6 md:px-8 py-2.5 sm:py-4 gap-2 ${className || ""}`}
      >
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 ml-70">
          {iconSRC && (
            <span className="mr-0 sm:mr-1 flex items-center justify-center shrink-0">
              <Image
                src={iconSRC}
                alt={iconALT}
                width={24}
                height={24}
                className="w-5 h-5 sm:w-6 sm:h-6 object-contain"
                style={{
                  filter: "invert(0.35) sepia(0.5) saturate(2) hue-rotate(240deg)",
                }}
                unoptimized
              />
            </span>
          )}
          <span className="text-sm sm:text-base md:text-lg text-gray-500 font-medium truncate">
            {titleText}
          </span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 md:gap-3 min-w-0">
          {/* Removed top search bar as requested */}
          <span className="hidden sm:inline text-gray-500 text-xs md:text-sm lg:text-lg whitespace-nowrap">
            Welcome{" "}
            <span className="text-[#7C5CFC] font-semibold">
              {session?.user?.name?.split(" ")[0] || session?.user?.email?.split("@")[0] || "User"}
            </span>{" "}
            <span className="inline-block">👋</span>
          </span>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <div className="relative" ref={dropdownRef}>
              <button
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-lg font-bold shadow cursor-pointer border-2 sm:border-4 border-white hover:scale-105 transition-all overflow-hidden"
                onClick={() => setShowDropdown((v) => !v)}
                title={session?.user?.name || session?.user?.email || undefined}
                style={profileImage ? {} : { backgroundColor: "#7C5CFC", color: "white" }}
              >
                {profileImage ? (
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

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";

type RecorderTopbarProps = {
  onBack: () => void;
  userInitials: string;
};

function RecorderTopbar({ onBack, userInitials }: RecorderTopbarProps) {
  const { data: session } = useSession();
  const [showDropdown, setShowDropdown] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null | undefined>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const username =
    session?.user?.name?.split(" ")[0] || session?.user?.email?.split("@")?.[0] || "User";

  useEffect(() => {
    const fetchUserImage = async () => {
      try {
        const res = await fetch("/api/user/get");
        const data = await res.json();
        if (data.user?.image && data.user.image.trim()) {
          setProfileImage(data.user.image + `?t=${Date.now()}`);
        } else {
          setProfileImage(null);
        }
      } catch (error) {
        console.error("Error fetching user image:", error);
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
          const res = await fetch("/api/user/get");
          const data = await res.json();
          if (data.user?.image && data.user.image.trim()) {
            setProfileImage(data.user.image + `?t=${Date.now()}`);
          } else {
            setProfileImage(null);
          }
        } catch (error) {
          console.error("Error fetching user image:", error);
          setProfileImage(null);
        }
      };
      fetchUserImage();
    };

    window.addEventListener("photoUpdated", handlePhotoUpdate);
    return () => window.removeEventListener("photoUpdated", handlePhotoUpdate);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return (
    <div className="w-full flex items-center justify-between px-4 sm:px-8 py-2 sm:py-4 bg-white border-b border-[#ede7fa] shadow-sm">
      <div className="flex items-center gap-2 sm:gap-6">
        <button
          onClick={onBack}
          className="text-[#7C5CFC] text-xl sm:text-2xl hover:bg-[#ede7fa] rounded-full p-1"
        >
          <Image
            src="/icons/arrow_left_icon.png"
            alt="Back"
            width={20}
            height={20}
            className="md:w-6 md:h-6"
          />
        </button>
      </div>
      <div className="flex items-center gap-4 sm:gap-6">
        <span className="hidden text-[#7C5CFC] font-medium text-base mr-[-2] sm:flex items-center gap-0">
          Welcome, {username}
          <span role="img" aria-label="waving hand" className="ml-1">
            👋
          </span>
        </span>

        <button className="relative text-[#7C5CFC] hover:bg-[#ede7fa] rounded-full p-2 hidden sm:block">
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
            className="w-10 h-10 md:w-12 md:h-12 rounded-full text-white flex items-center justify-center text-lg md:text-xl font-bold shadow cursor-pointer border-4 border-white hover:scale-105 transition-all overflow-hidden flex-shrink-0"
            onClick={() => setShowDropdown((v) => !v)}
            title={session?.user?.name || session?.user?.email || undefined}
            style={profileImage ? {} : { backgroundColor: "#6356D7" }}
          >
            {profileImage ? (
              <Image
                key={profileImage}
                src={profileImage}
                alt="Profile"
                width={48}
                height={48}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              userInitials
            )}
          </button>
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 md:w-64 bg-white rounded-lg shadow-lg p-3 md:p-4 z-50 border border-gray-200 animate-fade-in">
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
  );
}

export default RecorderTopbar;

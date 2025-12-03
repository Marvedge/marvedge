import { useSession, signOut } from "next-auth/react";
import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import { FaBars, FaXmark } from "react-icons/fa6";
import SidemenuDashboard from "./SidemenuDashboard";

type EditorTopbarProps = {
  onBack: () => void;
  userInitials: string;
  onToggleMenu: () => void;
};

const EditorTopbar = ({ onBack, userInitials, onToggleMenu }: EditorTopbarProps) => {
  const { data: session } = useSession();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isDashboardMenuOpen, setIsDashboardMenuOpen] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null | undefined>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLDivElement>(null);

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
      if (hamburgerRef.current && !hamburgerRef.current.contains(event.target as Node)) {
        setIsDashboardMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Toggle menu on hamburger click
  const handleHamburgerClick = () => {
    setIsDashboardMenuOpen((prev) => !prev);
    onToggleMenu(); // Keep this for mobile compatibility if needed
  };

  return (
    <div className="w-full flex items-center justify-between px-4 sm:px-8 py-2 sm:py-4 bg-white border-b border-[#ede7fa] shadow-sm">
      <div className="flex items-center gap-2 sm:gap-6">
        <button
          onClick={onBack}
          className="text-[#7C5CFC] text-xl sm:text-2xl hover:bg-[#ede7fa] rounded-full p-1 mr-2 sm:mr-4 order-1"
          style={{ order: 1 }}
        >
          <Image
            src="/icons/arrow_left_icon.png"
            alt="Back"
            width={20}
            height={20}
            className="md:w-6 md:h-6"
          />
        </button>
        <div className="relative" ref={hamburgerRef}>
          <button
            className="flex items-center gap-2 px-4 sm:px-6 h-10 sm:h-12 rounded-lg bg-[#A594F9] text-white font-semibold shadow-sm hover:bg-[#7C5CFC] focus:ring-2 focus:ring-[#A594F9] transition-all text-base max-w-xs min-w-fit whitespace-nowrap"
            onClick={handleHamburgerClick}
            aria-label="Toggle dashboard menu"
          >
            <FaBars className="text-xl" />
          </button>
          {isDashboardMenuOpen && (
            <div className="absolute top-12 left-0 w-64 bg-white shadow-lg p-4 border border-gray-200 rounded-lg z-50 sidebar-hover-menu">
              <button
                onClick={() => setIsDashboardMenuOpen(false)}
                className="absolute top-2 right-2 text-[#7C5CFC] hover:text-[#6356D7] text-xl"
                aria-label="Close menu"
              >
                <FaXmark />
              </button>
              <SidemenuDashboard />
            </div>
          )}
        </div>
        <span className="ml-2 sm:ml-0 text-lg sm:text-2xl font-extrabold text-[#7C5CFC] tracking-widest flex items-center gap-2 order-3">
          <Image
            src="/images/Transparent logo.png"
            alt="Marvedge logo"
            width={32}
            height={32}
            className="h-6 w-6 sm:h-8 sm:w-8 object-contain"
            priority
          />
          MARVEDGE
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="hidden sm:block text-[#7C5CFC] font-medium text-base mr-2 items-center gap-1">
          Welcome, {username}
          <span role="img" aria-label="waving hand" className="ml-1">
            👋
          </span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button className="relative text-[#7C5CFC] hover:bg-[#ede7fa] rounded-full p-1 w-8 h-8 sm:w-10 sm:h-10  items-center justify-center shrink-0 hidden sm:block">
            <Image
              src="/icons/bell.png"
              alt="Notifications"
              width={16}
              height={16}
              className="w-4 h-4 sm:w-5 sm:h-5"
            />
          </button>
          <div className="relative" ref={dropdownRef}>
            <button
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full text-white  items-center justify-center text-base sm:text-lg font-bold shadow cursor-pointer border-2 border-white hover:scale-105 transition-all block shrink-0 overflow-hidden"
              onClick={() => setShowDropdown((v) => !v)}
              title={session?.user?.name || session?.user?.email || undefined}
              style={profileImage ? {} : { backgroundColor: "#6356D7" }}
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
    </div>
  );
};

export default EditorTopbar;

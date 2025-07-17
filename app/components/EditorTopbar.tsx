import { useSession, signOut } from "next-auth/react";
import { useRef, useState, useEffect } from "react";
import Image from "next/image";

type EditorTopbarProps = {
  onBack: () => void;
  userInitials: string;
};

const EditorTopbar = ({
  onBack,
  userInitials,
}: EditorTopbarProps) => {
  const { data: session } = useSession();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Get first name or fallback
  const username =
    session?.user?.name?.split(" ")[0] ||
    session?.user?.email?.split("@")?.[0] ||
    "User";
  // Close dropdown on outside click
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
  return (
    <div className="w-full flex items-center justify-between px-4 sm:px-8 py-2 sm:py-4 bg-white border-b border-[#ede7fa] shadow-sm">
      <div className="flex items-center gap-2 sm:gap-6">
        {/* Mobile: left arrow at the left edge */}
        <button
          onClick={onBack}
          className="text-[#7C5CFC] text-xl sm:text-2xl hover:bg-[#ede7fa] rounded-full p-1 mr-2 sm:ml-4 sm:order-2 order-1"
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
        {/* Logo and title */}
        <span className="ml-2 sm:ml-0 text-lg sm:text-2xl font-extrabold text-[#7C5CFC] tracking-widest flex items-center gap-2 sm:order-1 order-2">
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
        {/* Remove or adjust hidden classes from siblings to prevent layout issues */}
        <div className="relative lg:mr-60 hidden sm:block">
          <input
            type="text"
            placeholder="Search"
            className="rounded-full border border-[#ede7fa] px-4 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]"
          />
        </div>
        <span className="hidden sm:block text-[#7C5CFC] font-medium text-base mr-2  items-center gap-1">
          Welcome, {username}
          <span role="img" aria-label="waving hand" className="ml-1">
            👋
          </span>
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Bell icon: hidden on mobile, visible on sm+ */}
          <button className="relative text-[#7C5CFC] hover:bg-[#ede7fa] rounded-full p-1 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center flex-shrink-0 hidden sm:block">
            <Image
              src="/icons/bell.png"
              alt="Notifications"
              width={16}
              height={16}
              className="w-4 h-4 sm:w-5 sm:h-5"
            />
          </button>
          {/* Avatar: always visible, never shrinks */}
          <div className="relative" ref={dropdownRef}>
            <button
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#6356D7] text-white flex items-center justify-center text-base sm:text-lg font-bold shadow cursor-pointer border-2 border-white hover:scale-105 transition-all block flex-shrink-0"
              onClick={() => setShowDropdown((v) => !v)}
              title={session?.user?.name || session?.user?.email || undefined}
            >
              {userInitials}
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

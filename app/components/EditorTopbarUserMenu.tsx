import Image from "next/image";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";

type EditorTopbarUserMenuProps = {
  username: string;
  session: Session | null;
  userInitials: string;
  profileImage: string | null | undefined;
  showDropdown: boolean;
  setShowDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
};

const EditorTopbarUserMenu = ({
  username,
  session,
  userInitials,
  profileImage,
  showDropdown,
  setShowDropdown,
  dropdownRef,
}: EditorTopbarUserMenuProps) => {
  return (
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
                onClick={() => signOut({ redirect: false }).then(() => window.location.assign("/"))}
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
};

export default EditorTopbarUserMenu;

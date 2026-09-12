import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import UserAvatar from "@/app/components/UserAvatar";
import Image from "next/image";
import { useUserStore } from "@/app/store/userStore";
import { JSX } from "react";

type EditorTopbarUserMenuProps = {
  username: string;
  session: Session | null;
  userInitials: string;
  showDropdown: boolean;
  setShowDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
};

const EditorTopbarUserMenu = ({
  username,
  session,
  userInitials,
  showDropdown,
  setShowDropdown,
  dropdownRef,
}: EditorTopbarUserMenuProps): JSX.Element => {
  // Just read from store - don't fetch
  const profileImage = useUserStore((state) => state.profileImage);

  return (
    <div className="flex items-center gap-2 sm:gap-4">
      <span className="hidden sm:block text-[#7C5CFC] font-medium text-base mr-2 items-center gap-1">
        Welcome, {username}
        <span role="img" aria-label="waving hand" className="ml-1">
          👋
        </span>
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button className="relative text-[#7C5CFC] hover:bg-[#ede7fa] rounded-full p-1 w-8 h-8 sm:w-10 sm:h-10 items-center justify-center shrink-0 hidden sm:block">
          <Image
            src="/icons/bell.png"
            alt="Notifications"
            width={16}
            height={16}
            className="w-4 h-4 sm:w-5 sm:h-5"
          />
        </button>
        <div className="relative" ref={dropdownRef}>
          <UserAvatar
            profileImage={profileImage}
            userInitials={userInitials}
            size={40}
            onClick={() => setShowDropdown((v) => !v)}
            className="w-8 h-8 sm:w-10 sm:h-10 border-2 border-white"
          />
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

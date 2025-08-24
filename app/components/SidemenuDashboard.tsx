import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  Play,
  Users,
  Settings,
} from "lucide-react";
import Image from "next/image";

const SidemenuDashboard = () => {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    return pathname === path;
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const activeClass =
    "bg-[#bcb3f7] text-white font-normal rounded-lg shadow-sm";
  const inactiveClass =
    "text-purple-200 font-normal hover:bg-[#bcb3f7] rounded-lg";

  return (
    <>
      <button
        onClick={toggleMobileMenu}
        className="md:hidden fixed top-4 left-4 z-40 bg-[#6356d7] text-white p-2 rounded-md shadow-lg"
        aria-label="Toggle menu"
      >
        <Menu size={24} />
      </button>

      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={closeMobileMenu}
        />
      )}

      <div
        className={`w-64 h-screen bg-[#6356d7] text-white p-6 fixed top-0 left-0 z-30 overflow-y-auto transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <button
          onClick={closeMobileMenu}
          className="md:hidden absolute top-4 right-4 text-white hover:text-gray-300"
          aria-label="Close menu"
        >
          <X size={24} />
        </button>

        <div
          className="flex cursor-pointer items-center gap-3 mb-6 mt-8 md:mt-0"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          <Image
            src="/images/Transparent logo.png"
            alt="Marvedge logo"
            width={40}
            height={40}
            className="object-contain"
            priority
          />
          <h2 className="text-2xl">MARVEDGE</h2>
        </div>
        <Link href="/recorder" onClick={closeMobileMenu}>
          <button className="w-full bg-white cursor-pointer text-purple-900 font-semibold py-2 rounded mb-6">
            + Create Demo
          </button>
        </Link>
        <ul className="space-y-2 text-lg">
          <Link href="/dashboard" onClick={closeMobileMenu}>
            <li
              className={`flex items-center gap-3 py-2 px-2 transition-colors cursor-pointer ${
                isActive("/dashboard") ? activeClass : inactiveClass
              }`}
            >
              <span className="mr-2">
                <Image
                  src="/icons/dash-home.svg"
                  alt="Marvedge logo"
                  width={30}
                  height={30}
                  className="object-contain"
                  priority
                />
              </span>
              Dashboard
            </li>
          </Link>
          <Link href="/demos" onClick={closeMobileMenu}>
            <li
              className={`flex items-center gap-3 py-2 px-2 transition-colors cursor-pointer ${
                isActive("/demos") ? activeClass : inactiveClass
              }`}
            >
              <span className="mr-2">
                <Image
                  src="/icons/dash-play.svg"
                  alt="Marvedge logo"
                  width={30}
                  height={30}
                  className="object-contain"
                  priority
                />
              </span>
              My Demos
            </li>
          </Link>
          <Link href="/templates" onClick={closeMobileMenu}>
            <li
              className={`flex items-center gap-3 py-2 px-2 transition-colors cursor-pointer ${
                isActive("/templates") ? activeClass : inactiveClass
              }`}
            >
              <span className="mr-2">
                <Image
                  src="/icons/dash-file.svg"
                  alt="Marvedge logo"
                  width={30}
                  height={30}
                  className="object-contain"
                  priority
                />
              </span>
              Templates
            </li>
          </Link>
          <Link href="/analytics" onClick={closeMobileMenu}>
            <li
              className={`flex items-center gap-3 py-2 px-2 transition-colors cursor-pointer ${
                isActive("/analytics") ? activeClass : inactiveClass
              }`}
            >
              <span className="mr-2">
                <Image
                  src="/icons/dash-analytics.svg"
                  alt="Notifications"
                  width={20}
                  height={20}
                  className="w-5 h-5 sm:w-6 sm:h-6"
                />{" "}
              </span>
              Analytics
            </li>
          </Link>
          <Link href="/team" onClick={closeMobileMenu}>
            <li
              className={`flex items-center gap-3 py-2 px-2 transition-colors cursor-pointer ${
                isActive("/team") ? activeClass : inactiveClass
              }`}
            >
              <span className="mr-2">
                <Users color="#fff" size={20} />
              </span>
              Team
            </li>
          </Link>
          <Link href="/settings" onClick={closeMobileMenu}>
            <li
              className={`flex items-center gap-3 py-2 px-2 transition-colors cursor-pointer ${
                isActive("/settings") ? activeClass : inactiveClass
              }`}
            >
              <span className="mr-2">
                <Settings color="#fff" size={20} />
              </span>
              Settings
            </li>
          </Link>
        </ul>
        <div className="mt-8">
          <h3 className="text-lg font-extralight text-gray-300">RECENT</h3>
          <ul className="space-y-1 text-base font-normal">
            <li className="py-2 cursor-pointer text-lg rounded hover:bg-[#bcb3f7] flex items-center gap-3 pl-2 whitespace-nowrap text-purple-200 font-light">
              <span>
                <Play color="#fff" size={20} />
              </span>
              Product Onboarding
            </li>
            <li className="py-2 cursor-pointer text-lg rounded hover:bg-[#bcb3f7] flex items-center gap-3 pl-2 whitespace-nowrap text-purple-200 font-light">
              <span>
                <Play color="#fff" size={20} />
              </span>
              Feature Walkthrough
            </li>
            <li className="py-2 cursor-pointer text-lg rounded hover:bg-[#bcb3f7] flex items-center gap-3 pl-2 whitespace-nowrap text-purple-200 font-light">
              <span>
                <Play color="#fff" size={20} />
              </span>
              Sales Demo
            </li>
          </ul>
        </div>
      </div>
    </>
  );
};

export default SidemenuDashboard;

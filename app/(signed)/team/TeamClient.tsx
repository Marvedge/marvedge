"use client";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import TeamsMain from "@/app/components/TeamsMain";
import { motion } from "framer-motion";
import { Users, ChevronDown } from "lucide-react";
import Image from "next/image";

const getInitials = (name: string | undefined): string => {
  if (!name) {
    return "?";
  }
  const parts = name.trim().split(" ");
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

type Team = {
  name: string;
  plan: string;
  description: string;
};

const TeamPage = () => {
  const { data: session } = useSession();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [teams, setTeams] = useState<Team[]>([
    {
      name: "AARMAN RAY",
      plan: "Free",
      description: "Write your team description here to view.",
    },
  ]);
  const [newTeam, setNewTeam] = useState<Team>({
    name: "",
    plan: "",
    description: "",
  });

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [displayedText, setDisplayedText] = useState("");
  const intervalMs = 150;
  const welcomeText = "Welcome ";

  useEffect(() => {
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex <= welcomeText.length) {
        setDisplayedText(welcomeText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, intervalMs);
    return () => clearInterval(interval);
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

  const initials = getInitials(session?.user?.name ?? session?.user?.email ?? undefined);

  const addTeam = () => {
    if (!newTeam.name || !newTeam.plan) {
      return;
    }
    setTeams((prev) => [...prev, newTeam]);
    setNewTeam({ name: "", plan: "", description: "" });
    setShowModal(false);
  };

  return (
    <div
      className="flex flex-col flex-grow h-full bg-[#F4F1FD] text-[#2D2154] relative overflow-y-auto"
      style={{ minHeight: "calc(100vh - 80px)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white/80 rounded-lg p-3 md:p-4 shadow relative z-10"
      >
        {/* Left Side: Team Title and Logo */}
        <div className="flex items-center gap-2 ml-4 mr-6">
          <Users color="#6356D7" size={24} />
          <span className="text-base sm:text-lg text-gray-400 font-medium">Team</span>
        </div>

        {/* Right Side: Welcome Text, Bell Icon, and User Initials */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative overflow-hidden">
            <motion.span
              className="text-gray-500 text-base sm:text-lg mr-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {displayedText}
            </motion.span>
            <motion.span
              className="text-[#6356D7] font-semibold text-lg sm:text-xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: ((welcomeText.length + 1) * intervalMs) / 1000,
              }}
            >
              {session?.user?.name
                ? session.user.name.split(" ")[0]
                : session?.user?.email || "User"}{" "}
              <motion.span
                role="img"
                aria-label="waving hand"
                style={{
                  display: "inline-block",
                  originX: 0.7,
                  originY: 0.7,
                }}
                animate={{ rotate: [0, 20, -10, 20, 0] }}
                transition={{
                  duration: 1.5,
                  repeat: 7,
                  repeatType: "loop",
                  ease: "easeInOut",
                  delay: ((welcomeText.length + 1) * intervalMs) / 1000 + 0.5,
                }}
              >
                👋
              </motion.span>
            </motion.span>
          </div>

          <button
            className="relative p-2 rounded-full hover:bg-[#F1ECFF] transition-colors focus:outline-none"
            title="Notifications"
          >
            <Image
              src="/icons/bell.png"
              alt="Notifications"
              width={20}
              height={20}
              className="w-5 h-5 sm:w-6 sm:h-6"
            />
          </button>

          <div className="relative" ref={dropdownRef}>
            <button
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#6356D7] text-white flex items-center justify-center text-md sm:text-xl font-bold shadow cursor-pointer border-4 border-white hover:scale-105 transition-all"
              onClick={() => setShowDropdown((v) => !v)}
              title={session?.user?.name || session?.user?.email || undefined}
            >
              {initials}
            </button>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="absolute right-0 mt-2 w-56 md:w-64 bg-white rounded-lg shadow-lg p-3 md:p-4 z-50 border border-gray-200"
              >
                <div className="mb-2 text-base md:text-lg font-bold text-[#6356D7]">
                  {session?.user?.name || "User"}
                </div>
                <div className="mb-1 text-gray-700 text-xs md:text-sm font-semibold">
                  {session?.user?.email}
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="mt-3 w-full px-4 py-2 bg-[#6356D7] text-white rounded hover:bg-[#7E5FFF] font-semibold transition-all text-sm md:text-base"
                >
                  Sign out
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      <TeamsMain onCreateTeamClick={() => setShowModal(true)} teams={teams} />

      {showModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="bg-white p-6 sm:p-10 rounded-xl w-full max-w-2xl shadow-xl"
          >
            <h2 className="text-xl font-semibold text-[#2D1E6B] mb-6">Create new team</h2>
            <form className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="Enter your team name"
                value={newTeam.name}
                onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                className="border border-[#D8CFFF] rounded-md px-4 py-3 text-sm text-[#7569A5] placeholder-[#B8AEE4] focus:ring-2 focus:ring-[#A99AF5] outline-none"
              />
              <textarea
                placeholder="Enter team description"
                value={newTeam.description}
                onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                className="border border-[#D8CFFF] rounded-md px-4 py-3 text-sm text-[#7569A5] placeholder-[#B8AEE4] h-24 resize-none focus:ring-2 focus:ring-[#A99AF5] outline-none"
              />
              <div className="relative">
                <select
                  value={newTeam.plan}
                  onChange={(e) => setNewTeam({ ...newTeam, plan: e.target.value })}
                  className="appearance-none w-full border border-[#D8CFFF] rounded-md px-4 py-3 text-sm text-[#7569A5] bg-white focus:ring-2 focus:ring-[#A99AF5] outline-none"
                >
                  <option value="">Plan Type</option>
                  <option value="Free">Free</option>
                  <option value="Pro">Pro</option>
                </select>
                <ChevronDown
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#A99AF5]"
                  size={18}
                />
              </div>
            </form>
            <div className="flex justify-between gap-4 mt-6">
              <button
                onClick={addTeam}
                className="w-full py-3 bg-[#7C62F8] text-white rounded-md font-medium hover:bg-[#684BEF] transition"
              >
                Create Team
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="w-full py-3 bg-white border border-[#E0D7FD] text-[#2D1E6B] rounded-md font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default TeamPage;

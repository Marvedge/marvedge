"use client";
import { useState } from "react";
import TeamsMain from "@/app/components/TeamsMain";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import SignedHeader from "@/app/components/SignedHeader";

type Team = {
  name: string;
  plan: string;
  description: string;
};

const TeamPage = () => {
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
      className="flex flex-col grow h-full bg-[#F4F1FD] text-[#2D2154] relative overflow-y-auto"
      style={{ minHeight: "calc(100vh - 80px)" }}
    >
      <SignedHeader titleText="Team" iconSRC="/icons/dash-users.svg" iconALT="team_icon" />

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

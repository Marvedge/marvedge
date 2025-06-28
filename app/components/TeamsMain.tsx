"use client";
import { Plus, Users } from "lucide-react";
import { motion } from "framer-motion";

type Team = {
  name: string;
  plan: string;
  description: string;
};

type TeamsMainProps = {
  onCreateTeamClick: () => void;
  teams: Team[];
};

export default function TeamsMain({ onCreateTeamClick, teams }: TeamsMainProps) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#F5F3FF] overflow-hidden">
      <main className="flex-grow bg-[#EDE9FE] flex items-center justify-center p-6 md:p-8 rounded-none md:rounded-tr-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center text-center"
        >
          <Users size={56} color="#6356D7" />
          <h2 className="text-2xl font-semibold text-[#7569A5] mt-6">
            Select a team to manage
          </h2>
          <p className="text-gray-500 text-base mt-2 px-4">
            Choose a team from the sidebar to view members and settings
          </p>
          <motion.button
            onClick={onCreateTeamClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="mt-6 px-6 py-3 bg-[#6356D7] hover:bg-[#7E5FFF] text-white rounded-lg font-semibold text-lg flex items-center gap-2 shadow transition-all"
          >
            <Plus size={24} color="white" />
            Create your Team
          </motion.button>
        </motion.div>
      </main>

      <aside className="w-full md:w-[320px] min-w-[280px] bg-white p-6 md:p-8 border-t md:border-t-0 md:border-l border-[#E0D7FD] rounded-t-3xl md:rounded-tl-3xl shadow-inner">
        <h3 className="text-xl md:text-2xl font-bold text-[#2D1E6B] mb-6 text-center md:text-right">
          Your Teams
        </h3>
        {teams.map((team, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-[#EDE9FE] p-5 rounded-xl mb-4 shadow-sm hover:shadow-md transition cursor-pointer"
          >
            <p className="text-[#7569A5] font-bold text-base">
              {team.name}
              <span className="ml-2 text-xs text-gray-500 font-light">
                {team.plan}
              </span>
            </p>
            <p className="text-gray-500 text-sm mt-1">{team.description}</p>
          </motion.div>
        ))}
      </aside>
    </div>
  );
}

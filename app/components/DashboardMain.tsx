import React from "react";
import Image from "next/image";
import Link from "next/link";
import { formatDate } from "@/app/lib/dateTimeUtils";
import { Play } from "lucide-react";

import { useRouter } from "next/navigation";

interface Demo {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string;
  startTime?: string | null;
  endTime?: string | null;
  segments?: unknown;
  createdAt: string;
  updatedAt: string;
  editing?: {
    segments?: unknown;
    zoom?: unknown;
  };
}

interface DashboardMainProps {
  initialDemos: Demo[];
  totalCount: number;
  totalViews: number;
  activeShares: number;
}

const DashboardMain = ({
  initialDemos,
  totalCount,
  totalViews,
  activeShares,
}: DashboardMainProps) => {
  const router = useRouter();

  const handleEditDemo = (demo: Demo) => {
    const params = new URLSearchParams({
      video: demo.videoUrl,
      ...(demo.startTime && { startTime: demo.startTime }),
      ...(demo.endTime && { endTime: demo.endTime }),
      title: demo.title || "",
      description: demo.description || "",
    });

    // Add segments and zoom data if available in editing
    if (demo.editing) {
      if (demo.editing.segments) {
        params.append("segments", JSON.stringify(demo.editing.segments));
      }
      if (demo.editing.zoom) {
        params.append("zoom", JSON.stringify(demo.editing.zoom));
      }
    } else if (demo.segments) {
      // fallback for old demos
      params.append("segments", JSON.stringify(demo.segments));
    }

    router.push(`/editor?${params.toString()}`);
  };
  const isLoading = false;

  const demos = initialDemos;

  return (
    <div
      className="flex-1 p-2 sm:p-4 md:p-8 bg-[#F1ECFF] min-h-screen mt-2 sm:mt-0 pt-2 sm:pt-0"
      style={{ fontFamily: "var(--font-raleway)" }}
    >
      <style jsx>{`
        @keyframes starBlink {
          0%,
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
          25% {
            transform: scale(0.8) rotate(90deg);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.2) rotate(180deg);
            opacity: 1;
          }
          75% {
            transform: scale(0.9) rotate(270deg);
            opacity: 0.8;
          }
        }

        .star-blink {
          animation: starBlink 2s ease-in-out infinite;
        }

        /* AI Orb Animations */
        .ai-orb-container {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 2rem;
          animation: ai-orb-float 4s ease-in-out infinite;
          position: relative;
        }
        .ai-orb-svg {
          filter: drop-shadow(0 0 18px #bcb3f7);
          z-index: 1;
        }
        .ai-orb-main {
          filter: blur(0.5px);
          animation: ai-orb-pulse 2.5s ease-in-out infinite alternate;
        }
        .ai-orb-glow {
          filter: blur(10px);
          opacity: 0.6;
          animation: ai-orb-glow 3s ease-in-out infinite alternate;
        }
        .ai-orb-aura {
          stroke: #bcb3f7;
          opacity: 0.3;
          transform-origin: 50% 50%;
          animation: ai-orb-aura-expand 2.8s ease-in-out infinite;
        }
        @keyframes ai-orb-float {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-7px);
          }
          100% {
            transform: translateY(0);
          }
        }
        @keyframes ai-orb-pulse {
          0% {
            filter: blur(0.5px);
          }
          100% {
            filter: blur(2.5px);
          }
        }
        @keyframes ai-orb-glow {
          0% {
            opacity: 0.6;
          }
          100% {
            opacity: 0.9;
          }
        }
        @keyframes ai-orb-aura-expand {
          0% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.12;
            transform: scale(1.15);
          }
          100% {
            opacity: 0.3;
            transform: scale(1);
          }
        }
        /* Modern sparkles */
        .ai-orb-sparkle {
          opacity: 0.8;
          filter: blur(0.2px);
          transform-origin: 50% 50%;
          animation-timing-function: linear;
        }
        .sparkle1 {
          animation: sparkle-orbit1 3.2s linear infinite;
        }
        .sparkle2 {
          animation: sparkle-orbit2 2.7s linear infinite;
        }
        .sparkle3 {
          animation: sparkle-orbit3 2.9s linear infinite;
        }
        .sparkle4 {
          animation: sparkle-orbit4 3.4s linear infinite;
        }
        .sparkle5 {
          animation: sparkle-orbit5 2.8s linear infinite;
        }
        .sparkle6 {
          animation: sparkle-orbit6 3.3s linear infinite;
        }
        @keyframes sparkle-orbit1 {
          0% {
            transform: rotate(0deg) translate(30px) scale(1);
            opacity: 0.8;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: rotate(360deg) translate(30px) scale(1.1);
            opacity: 0.8;
          }
        }
        @keyframes sparkle-orbit2 {
          0% {
            transform: rotate(60deg) translate(25px) scale(1);
            opacity: 0.7;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: rotate(420deg) translate(25px) scale(1.1);
            opacity: 0.7;
          }
        }
        @keyframes sparkle-orbit3 {
          0% {
            transform: rotate(120deg) translate(28px) scale(1);
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: rotate(480deg) translate(28px) scale(1.1);
            opacity: 0.6;
          }
        }
        @keyframes sparkle-orbit4 {
          0% {
            transform: rotate(180deg) translate(32px) scale(1);
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: rotate(540deg) translate(32px) scale(1.1);
            opacity: 0.5;
          }
        }
        @keyframes sparkle-orbit5 {
          0% {
            transform: rotate(240deg) translate(26px) scale(1);
            opacity: 0.7;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: rotate(600deg) translate(26px) scale(1.1);
            opacity: 0.7;
          }
        }
        @keyframes sparkle-orbit6 {
          0% {
            transform: rotate(300deg) translate(29px) scale(1);
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: rotate(660deg) translate(29px) scale(1.1);
            opacity: 0.6;
          }
        }
      `}</style>
      <div className="mb-4 sm:mb-6 md:mb-8">
        <h2 className="text-xs sm:text-sm md:text-base lg:text-lg font-light text-gray-400 mb-3 sm:mb-4">
          Here&apos;s what happening with your demos today
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-6">
          <div className="bg-[#261753]/6 rounded-xl p-3 sm:p-4 md:p-6 flex flex-col items-start shadow-sm min-h-[100px] sm:min-h-[110px] md:min-h-[140px] cursor-pointer transition-all duration-500 ease-out hover:scale-105 sm:hover:scale-110 hover:shadow-lg transform-gpu">
            <div className="mb-2">
              <span className="inline-block bg-[#8A76FC]/[0.14] p-1.5 sm:p-2 rounded-lg">
                <Image
                  src="/mingcute_play-fill.png"
                  alt="Play"
                  width={18}
                  height={18}
                  className="sm:w-6 sm:h-6 md:w-7 md:h-7"
                />
              </span>
            </div>
            <div className="text-xs sm:text-sm md:text-lg font-medium text-black">Total Demos</div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-[#261753]/72">
              {totalCount}
            </div>
            <div className="text-xs text-green-600 font-semibold mt-1">
              +12% <span className="text-gray-500 font-normal text-xs">vs last month</span>
            </div>
          </div>

          <div className="bg-[#9BE1F8]/14 rounded-xl p-3 sm:p-4 md:p-6 flex flex-col items-start shadow-sm min-h-[100px] sm:min-h-[110px] md:min-h-[140px] cursor-pointer transition-all duration-500 ease-out hover:scale-105 sm:hover:scale-110 hover:shadow-lg transform-gpu">
            <div className="mb-2">
              <span className="inline-block bg-[#1565D8]/12 p-1.5 sm:p-2 rounded-lg">
                <Image
                  src="/icons/dash-eye.svg"
                  alt="Views"
                  width={18}
                  height={18}
                  className="sm:w-6 sm:h-6 md:w-7 md:h-7"
                />
              </span>
            </div>
            <div className="text-xs sm:text-sm md:text-lg font-medium text-black">Total Views</div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-[#261753]/72">
              {totalViews}
            </div>
            <div className="text-xs text-green-600 font-semibold mt-1">
              +23%{""} <span className="text-gray-500 font-normal text-xs">vs last month</span>
            </div>
          </div>

          <div className="bg-[#261753]/6 rounded-xl p-3 sm:p-4 md:p-6 flex flex-col items-start shadow-sm min-h-[100px] sm:min-h-[110px] md:min-h-[140px] cursor-pointer transition-all duration-500 ease-out hover:scale-105 sm:hover:scale-110 hover:shadow-lg transform-gpu">
            <div className="mb-2">
              <span className="inline-block bg-[#62408F]/13 p-1.5 sm:p-2 rounded-lg">
                <Image
                  src="/icons/dash-grow.svg"
                  alt="Completion Rate"
                  width={18}
                  height={18}
                  className="sm:w-6 sm:h-6 md:w-7 md:h-7"
                />
              </span>
            </div>
            <div className="text-xs sm:text-sm md:text-lg font-medium text-black">
              Completion Rate
            </div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-[#261753]/72">0%</div>
            <div className="text-xs text-green-600 font-semibold mt-1">
              +5% <span className="text-gray-500 font-normal text-xs">vs last month</span>
            </div>
          </div>

          <div className="bg-[#DE610E]/10 rounded-xl p-3 sm:p-4 md:p-6 flex flex-col items-start shadow-sm min-h-[100px] sm:min-h-[110px] md:min-h-[140px] cursor-pointer transition-all duration-500 ease-out hover:scale-105 sm:hover:scale-110 hover:shadow-lg transform-gpu">
            <div className="mb-2">
              <span className="inline-block bg-[#DE610E]/15 p-1.5 sm:p-2 rounded-lg">
                <Image
                  src="/icons/share.png"
                  alt="Shares"
                  width={18}
                  height={18}
                  className="sm:w-6 sm:h-6 md:w-7 md:h-7"
                />
              </span>
            </div>
            <div className="text-xs sm:text-sm md:text-lg font-medium text-black">
              Active shares
            </div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-[#261753]/72">
              {activeShares}
            </div>
            <div className="text-xs text-green-600 font-semibold mt-1">
              +8%{""} <span className="text-gray-500 font-normal text-xs"> vs last month</span>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-8">
        <div className="lg:col-span-2 bg-white rounded-xl p-3 sm:p-4 shadow-sm min-h-[350px] sm:min-h-[410px] hover:shadow-lg transform flex flex-col">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-3 sm:mb-4">
            <h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-[#7569A5]">
              Recent Demos
            </h3>
            {demos.length > 5 && (
              <button
                className="text-[#6356D7] font-medium hover:underline text-xs sm:text-sm md:text-base"
                onClick={() => router.push("/demos")}
              >
                View all
              </button>
            )}
          </div>

          {/* Content Section - grows to fill available space and positions content at bottom */}
          <div className="flex-1 flex flex-col">
            {isLoading ? (
              // Show loader while fetching
              <div className="flex flex-col items-center justify-center flex-1 text-gray-500">
                <span>Loading demos...</span>
              </div>
            ) : demos.length > 0 ? (
              <div className="flex flex-col divide-y divide-gray-200 flex-1">
                {demos.slice(0, 4).map((demo: Demo) => (
                  <div key={demo.id}>
                    <div
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 sm:py-3 hover:bg-gray-50 px-1 sm:px-2 rounded-md cursor-pointer transition gap-2 sm:gap-0"
                      onClick={() => handleEditDemo(demo)}
                    >
                      {/* Left: Icon + Title + Description */}
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className="flex items-center justify-center bg-[#F8F6FF] rounded-lg w-8 h-8 sm:w-10 sm:h-10 shrink-0">
                          <Image
                            src="/icons/play-demo.svg"
                            alt="Play"
                            width={16}
                            height={16}
                            className="sm:w-5 sm:h-5"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-800 text-sm sm:text-base truncate">
                            {demo.title}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-500 truncate">
                            {demo.description || "No description"}
                          </div>
                        </div>
                      </div>

                      {/* Middle: Status + Updated Date */}
                      <div className="hidden md:flex items-center gap-8 lg:gap-10 text-xs lg:text-sm text-gray-500 shrink-0">
                        <div>Draft</div>
                        <div>{formatDate(demo.updatedAt)}</div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="mt-auto flex justify-center w-full">
                  <Link href={"/recorder"}>
                    <button className="mt-3 sm:mt-4 px-3 sm:px-4 py-1.5 sm:py-2 cursor-pointer bg-[#6356D7] text-white rounded-md font-semibold shadow hover:bg-[#7E5FFF] transition-all text-xs sm:text-sm md:text-base hover:scale-105 transform flex rounded-15 items-center gap-1.5 sm:gap-2 whitespace-nowrap">
                      <Play size={16} className="sm:w-[18px] sm:h-[18px]" />
                      Create Demo
                    </button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 px-4">
                <Image
                  src="/icons/play fill.png"
                  alt="Play"
                  width={32}
                  height={32}
                  className="sm:w-10 sm:h-10 md:w-12 md:h-12"
                />
                <div className="text-sm sm:text-base md:text-lg font-semibold text-[#6356D7] mt-3 sm:mt-4">
                  No demos yet
                </div>
                <div className="text-gray-500 text-xs sm:text-sm mt-1 text-center">
                  Create your first demo to get started
                </div>
                <Link href={"/recorder"}>
                  <button className="mt-3 sm:mt-4 px-3 sm:px-4 py-1.5 sm:py-2 cursor-pointer bg-[#6356D7] text-white rounded-md font-semibold shadow hover:bg-[#7E5FFF] transition-all text-xs sm:text-sm md:text-base hover:scale-105 transform flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
                    <Play size={16} className="sm:w-[18px] sm:h-[18px]" />
                    Create Demo
                  </button>
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:gap-4 md:gap-8">
          <div
            className="bg-[#6B5FFC] rounded-xl p-3 sm:p-4 md:p-6 shadow-sm flex flex-col justify-between min-h-40 sm:min-h-[180px] md:min-h-[200px] cursor-pointer transition-all duration-500 ease-out hover:scale-105 sm:hover:scale-110 hover:shadow-lg transform-gpu"
            style={{ fontFamily: "var(--font-raleway), sans-serif" }}
          >
            <div>
              <div className="flex items-center mb-2 sm:mb-3 md:mb-4">
                <span className="inline-block p-1.5 sm:p-2 rounded-lg mr-2 sm:mr-3 bg-white/20">
                  <Image
                    src="/ri_gemini-fill(1).png"
                    alt="AI Assistant"
                    width={16}
                    height={16}
                    className="sm:w-5 sm:h-5 md:w-[25px] md:h-[25px]"
                  />
                </span>
                <span className="text-base sm:text-lg md:text-xl font-bold text-white">
                  AI Assistant
                </span>
              </div>
              <div className="text-white text-xs sm:text-sm md:text-base mb-3 sm:mb-4 md:mb-6 leading-relaxed">
                Ready to help you create better demos with smart suggestions and content.
              </div>
            </div>
            <button className="w-full py-1.5 sm:py-2 md:py-3 bg-white/40 text-white font-semibold rounded-md transition-all text-xs sm:text-sm md:text-base transform hover:bg-white/60 hover:scale-105">
              Get AI Help
            </button>
          </div>

          <div className="bg-white rounded-xl p-3 sm:p-4 md:p-6 shadow-sm hover:shadow-lg transform">
            <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-[#2D2154] mb-3 sm:mb-4 md:mb-6">
              Popular Templates
            </h3>
            <div className="flex flex-col gap-2 sm:gap-3 md:gap-4">
              <div className="flex items-center gap-2 sm:gap-3 md:gap-4 hover:bg-gray-50 p-2 rounded-lg transition-all duration-300 hover:scale-105 transform">
                <span className="bg-[#C6F7D0] p-1.5 sm:p-2 rounded-lg shrink-0">
                  <Image
                    src="/icons/dash-users.svg"
                    alt="Google"
                    width={16}
                    height={16}
                    className="sm:w-5 sm:h-5 md:w-[25px] md:h-[25px]"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#2D2154] text-xs sm:text-sm md:text-base">
                    User Onboarding
                  </div>
                  <div className="text-gray-500 text-xs"> Guide new users through setup</div>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 md:gap-4 hover:bg-gray-50 p-2 rounded-lg transition-all duration-300 hover:scale-105 transform">
                <span className="bg-[#D0F0FF] p-1.5 sm:p-2 rounded-lg shrink-0">
                  <Image
                    src="/icons/dash-rocket.svg"
                    alt="Google"
                    width={16}
                    height={16}
                    className="sm:w-5 sm:h-5 md:w-[25px] md:h-[25px]"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#2D2154] text-xs sm:text-sm md:text-base">
                    Feature Launch
                  </div>
                  <div className="text-gray-500 text-xs">Showcase new capabilities</div>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 md:gap-4 hover:bg-gray-50 p-2 rounded-lg transition-all duration-300 hover:scale-105 transform">
                <span className="bg-[#E6E1FA] p-1.5 sm:p-2 rounded-lg shrink-0">
                  <Image
                    src="/icons/play fill.png"
                    alt="Google"
                    width={16}
                    height={16}
                    className="sm:w-5 sm:h-5 md:w-[25px] md:h-[25px]"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#2D2154] text-xs sm:text-sm md:text-base">
                    Sales Demo
                  </div>
                  <div className="text-gray-500 text-xs">Impress prospects</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardMain;

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import axios from "axios";
import { formatDate } from "@/app/lib/dateTimeUtils";

import { useRouter } from "next/navigation";

interface Demo {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  startTime: string;
  endTime: string;
  segments?: unknown;
  createdAt: string;
  updatedAt: string;
  editing?: {
    segments?: unknown;
    zoom?: unknown;
  };
}
const DashboardMain = () => {
  const [demos, setDemos] = useState<Demo[]>([]);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDemos = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get("/api/demo");
        console.log("Fetched demos:", response.data);
        setDemos(response.data.demos || []);
      } catch (err: unknown) {
        console.error("Error fetching demos:", err);

        if (axios.isAxiosError(err)) {
          const errMsg = err.response?.data?.message || "Failed to fetch demos";
          console.log(errMsg);
        } else {
          const errMsg = "Failed to fetch demos";
          console.log(errMsg);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchDemos();
  }, []);

  const handleEditDemo = (demo: Demo) => {
    const params = new URLSearchParams({
      video: demo.videoUrl,
      startTime: demo.startTime,
      endTime: demo.endTime,
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

  return (
    <div className="flex-1 p-4 md:p-8 bg-[#F1ECFF] min-h-screen">
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
      <div className="mb-6 md:mb-8">
        <h2 className="text-base md:text-lg font-light text-gray-400 mb-4">
          Here&apos;s what happening with your demos today
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          <div className="bg-[#E6E1FA] rounded-xl p-4 md:p-6 flex flex-col items-start shadow-sm min-h-[120px] md:min-h-[140px] cursor-pointer transition-all duration-500 ease-out hover:scale-110 hover:shadow-lg transform-gpu">
            <div className="mb-2">
              <span className="inline-block bg-[#B8AAFF] p-2 rounded-lg">
                <Image
                  src="/icons/dash-rect.svg"
                  alt="Play"
                  width={24}
                  height={24}
                  className="md:w-7 md:h-7"
                />
              </span>
            </div>
            <div className="text-sm md:text-lg font-medium text-black">
              Total Demos
            </div>
            <div className="text-2xl md:text-3xl font-bold text-black">0</div>
            <div className="text-xs text-green-600 font-semibold mt-1">
              +12%{" "}
              <span className="text-gray-500 font-normal">vs last month</span>
            </div>
          </div>

          <div className="bg-[#E6F0FF] rounded-xl p-4 md:p-6 flex flex-col items-start shadow-sm min-h-[120px] md:min-h-[140px] cursor-pointer transition-all duration-500 ease-out hover:scale-110 hover:shadow-lg transform-gpu">
            <div className="mb-2">
              <span className="inline-block bg-[#B8E0FF] p-2 rounded-lg">
                <Image
                  src="/icons/dash-eye.svg"
                  alt="Views"
                  width={24}
                  height={24}
                  className="md:w-7 md:h-7"
                />
              </span>
            </div>
            <div className="text-sm md:text-lg font-medium text-black">
              Total Views
            </div>
            <div className="text-2xl md:text-3xl font-bold text-black">0</div>
            <div className="text-xs text-green-600 font-semibold mt-1">
              +23%{" "}
              <span className="text-gray-500 font-normal">vs last month</span>
            </div>
          </div>

          <div className="bg-[#E6E1FA] rounded-xl p-4 md:p-6 flex flex-col items-start shadow-sm min-h-[120px] md:min-h-[140px] cursor-pointer transition-all duration-500 ease-out hover:scale-110 hover:shadow-lg transform-gpu">
            <div className="mb-2">
              <span className="inline-block bg-[#B8AAFF] p-2 rounded-lg">
                <Image
                  src="/icons/dash-grow.svg"
                  alt="Completion Rate"
                  width={24}
                  height={24}
                  className="md:w-7 md:h-7"
                />
              </span>
            </div>
            <div className="text-sm md:text-lg font-medium text-black">
              Completion Rate
            </div>
            <div className="text-2xl md:text-3xl font-bold text-black">0%</div>
            <div className="text-xs text-green-600 font-semibold mt-1">
              +5%{" "}
              <span className="text-gray-500 font-normal">vs last month</span>
            </div>
          </div>

          <div className="bg-[#F9E6E6] rounded-xl p-4 md:p-6 flex flex-col items-start shadow-sm min-h-[120px] md:min-h-[140px] cursor-pointer transition-all duration-500 ease-out hover:scale-110 hover:shadow-lg transform-gpu">
            <div className="mb-2">
              <span className="inline-block bg-[#FFB8B8] p-2 rounded-lg">
                <Image
                  src="/icons/share.png"
                  alt="Shares"
                  width={24}
                  height={24}
                  className="md:w-7 md:h-7"
                />
              </span>
            </div>
            <div className="text-sm md:text-lg font-medium text-black">
              Active shares
            </div>
            <div className="text-2xl md:text-3xl font-bold text-black">0</div>
            <div className="text-xs text-green-600 font-semibold mt-1">
              +8%{" "}
              <span className="text-gray-500 font-normal">vs last month</span>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
        <div className="lg:col-span-2 bg-white rounded-xl p-4 shadow-sm h-[410px]  hover:shadow-lg transform">
          {isLoading ? (
            // Show loader while fetching
            <div className="flex flex-col items-center justify-center py-6 text-gray-500">
              {/* <svg
                className="animate-spin h-6 w-6 text-[#6356D7] mb-3"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                ></path>
              </svg> */}
              <span>Loading demos...</span>
            </div>
          ) : demos.length > 0 ? (
            <div className="flex flex-col divide-y divide-gray-200">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl md:text-2xl font-semibold text-[#7569A5]">
                  Recent Demos
                </h3>
                {demos.length > 5 && (
                  <button
                    className="text-[#6356D7] font-medium hover:underline text-sm md:text-base"
                    onClick={() => router.push("/demos")} // or Link
                  >
                    View all
                  </button>
                )}
              </div>
              {demos.slice(0, 4).map((demo: Demo) => (
                <div key={demo.id}>
                  <div
                    className="flex items-center justify-between py-3 hover:bg-gray-50 px-2 rounded-md cursor-pointer transition"
                    onClick={() => handleEditDemo(demo)}
                  >
                    {/* Left: Icon + Title + Description */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center bg-[#F8F6FF] rounded-lg w-10 h-10">
                        <Image
                          src="/icons/play-demo.svg"
                          alt="Play"
                          width={20}
                          height={20}
                        />
                      </div>
                      <div>
                        <div className="font-medium text-gray-800">
                          {demo.title}
                        </div>
                        <div className="text-sm text-gray-500 truncate w-40">
                          {demo.description || "No description"}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Status + Updated Date */}
                    <div className="hidden md:flex items-center gap-10 text-sm text-gray-500">
                      <div>Draft</div>
                      <div>{formatDate(demo.updatedAt)}</div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="mx-auto">
                <Link href={"/recorder"}>
                  <button className="mt-4 px-4 py-2 cursor-pointer bg-[#6356D7] text-white rounded-md font-semibold shadow hover:bg-[#7E5FFF]  transition-all text-sm md:text-base hover:scale-105 transform items-center gap-2">
                    <Image
                      src="/icons/play fill.png"
                      alt="Play"
                      width={18}
                      height={18}
                      className="inline-block"
                    />
                    Create Demo
                  </button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6">
              <Image
                src="/icons/play fill.png"
                alt="Play"
                width={40}
                height={40}
                className="md:w-12 md:h-12"
              />
              <div className="text-base md:text-lg font-semibold text-[#6356D7] mt-4">
                No demos yet
              </div>
              <div className="text-gray-500 text-xs md:text-sm mt-1 text-center">
                Create your first demo to get started
              </div>
              <Link href={"/recorder"}>
                <button className="mt-4 px-4 py-2 cursor-pointer bg-[#6356D7] text-white rounded-md font-semibold shadow hover:bg-[#7E5FFF] transition-all text-sm md:text-base hover:scale-105 transform items-center gap-2">
                  <Image
                    src="/icons/play fill.png"
                    alt="Play"
                    width={18}
                    height={18}
                    className="inline-block"
                  />
                  Create Demo
                </button>
              </Link>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 md:gap-8">
          <div className="bg-[#C6B8F7] rounded-xl p-4 md:p-6 shadow-sm flex flex-col justify-between min-h-[180px] md:min-h-[200px] cursor-pointer transition-all duration-500 ease-out hover:scale-110 hover:shadow-lg transform-gpu">
            <div>
              <div className="flex items-center mb-3 md:mb-4">
                <span className="inline-block p-2 rounded-lg mr-3 star-blink">
                  <Image
                    src="/icons/ai-orb-icon.png"
                    alt="Google"
                    width={20}
                    height={20}
                    className="sm:w-[25px] sm:h-[25px]"
                  />
                </span>
                <span className="text-lg md:text-xl font-bold text-white">
                  AI Assistant
                </span>
              </div>
              <div className="text-white text-sm md:text-base mb-4 md:mb-6">
                Ready to help you create better demos with smart suggestions and
                auto generated content.
              </div>
            </div>
            <button className="w-full py-2 md:py-3 bg-white/40 text-white font-semibold rounded-md transition-all text-sm md:text-base transform hover:bg-white/60 hover:scale-105">
              Get AI Help
            </button>
          </div>

          <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm hover:shadow-lg transform">
            <h3 className="text-xl md:text-2xl font-bold text-[#2D2154] mb-4 md:mb-6">
              Popular Templates
            </h3>
            <div className="flex flex-col gap-3 md:gap-4">
              <div className="flex items-center gap-3 md:gap-4 hover:bg-gray-50 p-2 rounded-lg transition-all duration-300 hover:scale-105 transform">
                <span className="bg-[#C6F7D0] p-2 rounded-lg shrink-0">
                  <Image
                    src="/icons/dash-users.svg"
                    alt="Google"
                    width={20}
                    height={20}
                    className="sm:w-[25px] sm:h-[25px]"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#2D2154] text-sm md:text-base">
                    User Onboarding
                  </div>
                  <div className="text-gray-500 text-xs md:text-sm">
                    Guide new users through setup
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 md:gap-4 hover:bg-gray-50 p-2 rounded-lg transition-all duration-300 hover:scale-105 transform">
                <span className="bg-[#D0F0FF] p-2 rounded-lg shrink-0">
                  <Image
                    src="/icons/dash-rocket.svg"
                    alt="Google"
                    width={20}
                    height={20}
                    className="sm:w-[25px] sm:h-[25px]"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#2D2154] text-sm md:text-base">
                    Feature Launch
                  </div>
                  <div className="text-gray-500 text-xs md:text-sm">
                    Showcase new capabilities
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 md:gap-4 hover:bg-gray-50 p-2 rounded-lg transition-all duration-300 hover:scale-105 transform">
                <span className="bg-[#E6E1FA] p-2 rounded-lg shrink-0">
                  <Image
                    src="/icons/play fill.png"
                    alt="Google"
                    width={20}
                    height={20}
                    className="sm:w-[25px] sm:h-[25px]"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#2D2154] text-sm md:text-base">
                    Sales Demo
                  </div>
                  <div className="text-gray-500 text-xs md:text-sm">
                    Impress prospects
                  </div>
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

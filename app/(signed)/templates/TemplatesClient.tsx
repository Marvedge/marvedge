"use client";
import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";

export const metadata = {
  titleText: "Explore Templates",
  iconSRC: "/icons/explore-templates.svg",
};
const templates = [
  {
    title: "SaaS Product Onboarding",
    description:
      "Complete user onboarding flow for a SaaS application with guided tour of key features.",
    time: "15m",
    level: "Beginner",
    type: "saas",
    popular: true,
    badge: "Popular",
  },
  {
    title: "E-commerce Checkout Flow",
    description: "Demonstrate the complete checkout process from cart to payment confirmation.",
    time: "20m",
    level: "Intermediate",
    type: "e commerce",
    popular: true,
    badge: "Popular",
  },
  {
    title: "Mobile App Tutorial",
    description: "Demonstrate the interactive tutorial for mobile app first time users",
    time: "10m",
    level: "Beginner",
    type: "mobile",
    popular: false,
  },
  {
    title: "Web Dashboard Overview",
    description: "Overview of a comprehensive walkthrough of an analytics dashboard.",
    time: "25m",
    level: "Beginner",
    type: "web",
    popular: true,
    badge: "Popular",
  },
  {
    title: "API Integration Guide",
    description: "Step-by-step API integration demonstration for developers",
    time: "30m",
    level: "Advanced",
    type: "web",
    popular: false,
    badge: "Advanced",
  },
  {
    title: "Customer Support Flow",
    description: "Complete customer support ticket creation and tracking process.",
    time: "10m",
    level: "Beginner",
    type: "saas",
    popular: false,
  },
];

const sortOptions = [
  {
    label: "Title",
    icon: (
      <Image
        src="/icons/title.png"
        alt="Notifications"
        width={24}
        height={24}
        className="w-6 h-6"
      />
    ),
  },
  {
    label: "Last Updated",
    icon: (
      <Image
        src="/icons/history.png"
        alt="Notifications"
        width={24}
        height={24}
        className="w-6 h-6"
      />
    ),
  },
  {
    label: "Created date",
    icon: (
      <Image
        src="/icons/created-date.png"
        alt="Notifications"
        width={24}
        height={24}
        className="w-6 h-6"
      />
    ),
  },
  {
    label: "Views",
    icon: (
      <Image
        src="/icons/views.png"
        alt="Notifications"
        width={24}
        height={24}
        className="w-6 h-6"
      />
    ),
  },
];

export default function TemplatesPage() {
  const [search, setSearch] = useState("");
  const [levelDropdownOpen, setLevelDropdownOpen] = useState(false);
  const levelDropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (levelDropdownRef.current && !levelDropdownRef.current.contains(event.target as Node)) {
        setLevelDropdownOpen(false);
      }
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-[#F3F0FC]">
      <div
        className="p-2 sm:p-4 md:p-6 lg:p-8 bg-[#F3F0FC] h-full overflow-y-auto"
        style={{ minHeight: "calc(100vh - 80px)" }}
      >
        <div className="mb-4 sm:mb-6">
          <p className="text-[#8B8B8B] text-xs sm:text-sm md:text-base lg:text-lg">
            For faster demo creation use the professionally designed templates.
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 md:gap-4 mt-3 sm:mt-4 mb-4 sm:mb-6 w-full max-w-full">
            <div className="relative flex-1 w-full sm:max-w-xl">
              <input
                type="text"
                placeholder="Search templates"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 sm:px-5 py-2 sm:py-3 rounded-xl border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#A594F9] shadow-sm pr-12 text-xs sm:text-base"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4 w-full sm:w-auto">
              <button className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg bg-white border border-gray-200 text-[#A594F9] font-medium hover:bg-[#ede7fa] text-xs sm:text-sm">
                <Image
                  src="/icons/down-arrow.svg"
                  alt="Notifications"
                  width={24}
                  height={24}
                  className="w-4 h-4 sm:w-6 sm:h-6"
                />
                <span className="hidden sm:inline">All Categories</span>
                <span className="sm:hidden">Categories</span>
              </button>
              <div className="relative" ref={ref}>
                <button
                  className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg bg-white border border-gray-200 text-[#A594F9] font-medium hover:bg-[#ede7fa] text-xs sm:text-sm"
                  onClick={() => setOpen((prev) => !prev)}
                >
                  <span className="material-icons"></span>
                  <Image
                    src="/icons/sort.svg"
                    alt="Notifications"
                    width={24}
                    height={24}
                    className="w-4 h-4 sm:w-6 sm:h-6"
                  />
                  <span className="hidden sm:inline">Sort By</span>
                  <span className="sm:hidden">Sort</span>
                </button>
                {open && (
                  <div className="absolute left-0 mt-2 w-40 sm:w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-10">
                    {sortOptions.map((option) => (
                      <button
                        key={option.label}
                        className="flex items-center gap-2 sm:gap-3 w-full px-3 sm:px-5 py-2 sm:py-3 text-gray-700 hover:bg-[#f3f0fa] transition text-xs sm:text-sm"
                        onClick={() => {
                          // handle sort logic here
                          setOpen(false);
                        }}
                      >
                        <span className="w-4 h-4 sm:w-6 sm:h-6">{option.icon}</span>
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg bg-white border border-gray-200 text-[#A594F9] font-medium hover:bg-[#ede7fa] text-xs sm:text-sm"
                  onClick={() => setLevelDropdownOpen((v) => !v)}
                >
                  <Image
                    src="/icons/filter.svg"
                    alt="Notifications"
                    width={24}
                    height={24}
                    className="w-4 h-4 sm:w-6 sm:h-6"
                  />
                  <span className="hidden sm:inline">All levels</span>
                  <span className="sm:hidden">Filter</span>
                </button>
                {levelDropdownOpen && (
                  <div
                    ref={levelDropdownRef}
                    className="absolute left-0 top-full mt-2 bg-white rounded-2xl shadow-lg z-50 border border-gray-100 min-w-40 animate-fade-in"
                  >
                    <div className="flex flex-col divide-y divide-gray-100">
                      <div className="px-4 sm:px-6 py-2 sm:py-3 cursor-pointer text-center text-green-500 font-medium hover:bg-[#F3F0FC] rounded-t-2xl text-xs sm:text-sm">
                        Beginner
                      </div>
                      <div className="px-4 sm:px-6 py-2 sm:py-3 cursor-pointer text-center text-yellow-500 font-medium hover:bg-[#F3F0FC] text-xs sm:text-sm">
                        Intermediate
                      </div>
                      <div className="px-4 sm:px-6 py-2 sm:py-3 cursor-pointer text-center text-red-500 font-medium hover:bg-[#F3F0FC] rounded-b-2xl text-xs sm:text-sm">
                        Advanced
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
          <h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-[#1A0033]">Templates</h3>
          <span className="text-[#8B8B8B] font-medium text-xs sm:text-sm">
            {templates.length}/6 demos
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6 lg:gap-8">
          {templates.map((tpl) => (
            <div
              key={tpl.title}
              className="bg-white rounded-2xl p-3 sm:p-4 md:p-6 flex flex-col shadow-sm border border-[#F3F0FC]"
            >
              <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-2">
                {tpl.popular && (
                  <span className="bg-[#F8E7A1] text-[#E6B800] text-xs font-semibold px-2 py-1 rounded mr-1 sm:mr-2">
                    ★ Popular
                  </span>
                )}
                {tpl.badge && tpl.badge !== "Popular" && (
                  <span className="bg-[#E7F8E7] text-[#4CAF50] text-xs font-semibold px-2 py-1 rounded">
                    {tpl.badge}
                  </span>
                )}
                {tpl.level && tpl.level !== "Beginner" && tpl.level !== "Advanced" && (
                  <span className="bg-[#E7F8E7] text-[#4CAF50] text-xs font-semibold px-2 py-1 rounded">
                    {tpl.level}
                  </span>
                )}
                {tpl.level === "Beginner" && (
                  <span className="bg-[#E7F8E7] text-[#4CAF50] text-xs font-semibold px-2 py-1 rounded">
                    Beginner
                  </span>
                )}
                {tpl.level === "Intermediate" && (
                  <span className="bg-[#F8F3E7] text-[#E6B800] text-xs font-semibold px-2 py-1 rounded">
                    Intermediate
                  </span>
                )}
                {tpl.level === "Advanced" && (
                  <span className="bg-[#F8E7E7] text-[#E64A19] text-xs font-semibold px-2 py-1 rounded">
                    Advanced
                  </span>
                )}
              </div>
              <div className="font-semibold text-base sm:text-lg text-[#1A0033] mb-1">
                {tpl.title}
              </div>
              <div className="text-[#8B8B8B] text-xs sm:text-sm mb-3 sm:mb-4">
                {tpl.description}
              </div>
              <div className="flex-1 flex items-center justify-center bg-[#F8F6FF] rounded-xl mb-4 sm:mb-6 min-h-[100px] sm:min-h-[120px]">
                <svg
                  width="71"
                  height="71"
                  viewBox="0 0 71 71"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <mask id="path-1-inside-1_253_707" fill="white">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M37.2541 67.7256L37.2215 67.7315L37.0115 67.8351L36.9523 67.8469L36.9109 67.8351L36.7009 67.7315C36.6693 67.7217 36.6456 67.7266 36.6299 67.7463L36.618 67.7759L36.5677 69.0421L36.5825 69.1012L36.6121 69.1397L36.9198 69.3586L36.9641 69.3704L36.9996 69.3586L37.3073 69.1397L37.3428 69.0924L37.3546 69.0421L37.3044 67.7789C37.2965 67.7473 37.2797 67.7296 37.2541 67.7256ZM38.038 67.3913L37.9996 67.3972L37.4523 67.6724L37.4227 67.7019L37.4138 67.7345L37.4671 69.0066L37.4819 69.0421L37.5055 69.0628L38.1001 69.3379C38.1376 69.3478 38.1662 69.3399 38.1859 69.3142L38.1978 69.2728L38.0972 67.4564C38.0873 67.4209 38.0676 67.3992 38.038 67.3913ZM35.9228 67.3972C35.9098 67.3893 35.8942 67.3868 35.8793 67.3901C35.8644 67.3934 35.8514 67.4023 35.8429 67.415L35.8252 67.4564L35.7246 69.2728C35.7266 69.3083 35.7433 69.332 35.7749 69.3438L35.8193 69.3379L36.4139 69.0628L36.4435 69.0391L36.4553 69.0066L36.5056 67.7345L36.4967 67.699L36.4671 67.6694L35.9228 67.3972Z"
                    />
                  </mask>
                  <path
                    d="M37.2541 67.7256L37.8623 63.7721L37.1988 63.67L36.5383 63.7902L37.2541 67.7256ZM37.2215 67.7315L36.5057 63.7961L35.955 63.8963L35.4529 64.1438L37.2215 67.7315ZM37.0115 67.8351L37.7959 71.7574L38.3099 71.6546L38.7801 71.4228L37.0115 67.8351ZM36.9523 67.8469L35.8535 71.693L36.7859 71.9594L37.7367 71.7692L36.9523 67.8469ZM36.9109 67.8351L35.1423 71.4228L35.4655 71.5822L35.8121 71.6812L36.9109 67.8351ZM36.7009 67.7315L38.4695 64.1438L38.1907 64.0063L37.894 63.9136L36.7009 67.7315ZM36.6299 67.7463L33.5064 65.2475L33.1361 65.7105L32.9159 66.2609L36.6299 67.7463ZM36.618 67.7759L32.9041 66.2905L32.6485 66.9295L32.6212 67.6171L36.618 67.7759ZM36.5677 69.0421L32.5709 68.8833L32.5481 69.4561L32.6872 70.0122L36.5677 69.0421ZM36.5825 69.1012L32.702 70.0714L32.904 70.8797L33.412 71.5401L36.5825 69.1012ZM36.6121 69.1397L33.4416 71.5785L33.806 72.0523L34.2931 72.3989L36.6121 69.1397ZM36.9198 69.3586L34.6008 72.6178L35.1902 73.0372L35.8892 73.2236L36.9198 69.3586ZM36.9641 69.3704L35.9336 73.2354L37.0918 73.5442L38.229 73.1652L36.9641 69.3704ZM36.9996 69.3586L38.2645 73.1534L38.8316 72.9644L39.3187 72.6178L36.9996 69.3586ZM37.3073 69.1397L39.6263 72.3989L40.1337 72.0378L40.5074 71.5396L37.3073 69.1397ZM37.3428 69.0924L40.5429 71.4923L41.0449 70.8229L41.2365 70.0084L37.3428 69.0924ZM37.3546 69.0421L41.2483 69.9582L41.3732 69.4276L41.3515 68.8829L37.3546 69.0421ZM37.3044 67.7789L41.3012 67.6197L41.2848 67.2082L41.1849 66.8087L37.3044 67.7789ZM38.038 67.3913L39.0687 63.5264L38.2587 63.3104L37.4301 63.4378L38.038 67.3913ZM37.9996 67.3972L37.3916 63.4437L36.7673 63.5397L36.203 63.8234L37.9996 67.3972ZM37.4523 67.6724L35.6557 64.0985L35.0797 64.3881L34.6238 64.8439L37.4523 67.6724ZM37.4227 67.7019L34.5943 64.8735L33.8431 65.6247L33.5636 66.6497L37.4227 67.7019ZM37.4138 67.7345L33.5547 66.6822L33.3913 67.2813L33.4173 67.9018L37.4138 67.7345ZM37.4671 69.0066L33.4706 69.1739L33.5004 69.8866L33.7748 70.5452L37.4671 69.0066ZM37.4819 69.0421L33.7896 70.5807L34.1476 71.4397L34.8479 72.0524L37.4819 69.0421ZM37.5055 69.0628L34.8716 72.0732L35.3042 72.4517L35.8258 72.693L37.5055 69.0628ZM38.1001 69.3379L36.4205 72.9681L36.7408 73.1164L37.0822 73.2062L38.1001 69.3379ZM38.1859 69.3142L41.3564 71.7531L41.8222 71.1476L42.0321 70.4131L38.1859 69.3142ZM38.1978 69.2728L42.0439 70.3716L42.2289 69.7241L42.1917 69.0517L38.1978 69.2728ZM38.0972 67.4564L42.0911 67.2352L42.0671 66.803L41.9513 66.3858L38.0972 67.4564ZM35.9228 67.3972L33.8497 70.8181L33.9886 70.9023L34.1339 70.9749L35.9228 67.3972ZM35.8429 67.415L32.5161 65.1942L32.3115 65.5006L32.1664 65.8392L35.8429 67.415ZM35.8252 67.4564L32.1487 65.8806L31.8704 66.5299L31.8313 67.2352L35.8252 67.4564ZM35.7246 69.2728L31.7307 69.0517L31.7185 69.2732L31.7308 69.4947L35.7246 69.2728ZM35.7749 69.3438L34.3704 73.0891L35.3096 73.4413L36.3038 73.3087L35.7749 69.3438ZM35.8193 69.3379L36.3482 73.3028L36.9489 73.2227L37.4989 72.9682L35.8193 69.3379ZM36.4139 69.0628L38.0936 72.693L38.5338 72.4893L38.9125 72.1864L36.4139 69.0628ZM36.4435 69.0391L38.9421 72.1627L39.819 71.4613L40.2027 70.406L36.4435 69.0391ZM36.4553 69.0066L40.2145 70.3735L40.4276 69.7876L40.4522 69.1646L36.4553 69.0066ZM36.5056 67.7345L40.5025 67.8925L40.5251 67.32L40.3861 66.7642L36.5056 67.7345ZM36.4967 67.699L40.3773 66.7287L40.1085 65.6539L39.3252 64.8706L36.4967 67.699ZM36.4671 67.6694L38.256 64.0917L37.7117 63.8195L35.9228 67.3972L34.1339 70.9749L34.6783 71.2471L36.4671 67.6694Z"
                    fill="#6356D7"
                    fillOpacity="0.53"
                    mask="url(#path-1-inside-1_253_707)"
                  />
                  <path
                    d="M20.9512 12.25C21.3159 12.2285 21.681 12.2923 22.0166 12.4365L22.0195 12.4385C25.1036 13.7569 32.0712 16.9137 40.9229 22.0225C49.7747 27.1326 55.9941 31.5904 58.6768 33.5986V33.5996C59.9431 34.5494 59.9463 36.4183 58.6787 37.3711C56.0283 39.3632 49.8856 43.7627 40.9229 48.9404C31.9513 54.1181 25.0674 57.2369 22.0166 58.5361L22.0146 58.5371C20.5629 59.1572 18.9464 58.2238 18.7568 56.6543C18.3561 53.3379 17.5996 45.7483 17.5996 35.4844C17.5996 25.226 18.3534 17.6397 18.7568 14.3223V14.3174C18.8 13.9546 18.9278 13.6068 19.1289 13.3018C19.33 12.9969 19.5996 12.7431 19.916 12.5605C20.2323 12.3781 20.5867 12.2715 20.9512 12.25Z"
                    stroke="#6356D7"
                    strokeOpacity="0.53"
                    strokeWidth="4"
                  />
                </svg>
              </div>
              <div className="flex flex-wrap items-center justify-between text-[#8B8B8B] text-xs sm:text-base gap-2 sm:gap-0 mb-3 sm:mb-4">
                <div className="flex items-center gap-1 sm:gap-2">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4 sm:w-6 sm:h-6"
                  >
                    <path
                      d="M12 2C17.523 2 22 6.477 22 12C22 17.523 17.523 22 12 22C6.477 22 2 17.523 2 12C2 6.477 6.477 2 12 2ZM12 4C9.87827 4 7.84344 4.84285 6.34315 6.34315C4.84285 7.84344 4 9.87827 4 12C4 14.1217 4.84285 16.1566 6.34315 17.6569C7.84344 19.1571 9.87827 20 12 20C14.1217 20 16.1566 19.1571 17.6569 17.6569C19.1571 16.1566 20 14.1217 20 12C20 9.87827 19.1571 7.84344 17.6569 6.34315C16.1566 4.84285 14.1217 4 12 4ZM12 6C12.2449 6.00003 12.4813 6.08996 12.6644 6.25272C12.8474 6.41547 12.9643 6.63975 12.993 6.883L13 7V11.586L15.707 14.293C15.8863 14.473 15.9905 14.7144 15.9982 14.9684C16.006 15.2223 15.9168 15.4697 15.7488 15.6603C15.5807 15.8508 15.3464 15.9703 15.0935 15.9944C14.8406 16.0185 14.588 15.9454 14.387 15.79L14.293 15.707L11.293 12.707C11.1376 12.5514 11.0378 12.349 11.009 12.131L11 12V7C11 6.73478 11.1054 6.48043 11.2929 6.29289C11.4804 6.10536 11.7348 6 12 6Z"
                      fill="black"
                      fillOpacity="0.48"
                    />
                  </svg>

                  <span className="hidden sm:inline">{tpl.time}</span>
                  <span className="sm:hidden text-xs">{tpl.time}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4 sm:w-6 sm:h-6"
                  >
                    <path
                      d="M13.07 10.41C13.6774 9.5613 14.0041 8.54375 14.0041 7.50004C14.0041 6.45632 13.6774 5.43877 13.07 4.59004C13.6388 4.20257 14.3118 3.99684 15 4.00004C15.9283 4.00004 16.8185 4.36879 17.4749 5.02516C18.1313 5.68154 18.5 6.57178 18.5 7.50004C18.5 8.42829 18.1313 9.31853 17.4749 9.97491C16.8185 10.6313 15.9283 11 15 11C14.3118 11.0032 13.6388 10.7975 13.07 10.41ZM5.5 7.50004C5.5 6.8078 5.70527 6.13111 6.08986 5.55554C6.47444 4.97997 7.02107 4.53137 7.66061 4.26646C8.30015 4.00155 9.00388 3.93224 9.68282 4.06729C10.3617 4.20234 10.9854 4.53568 11.4749 5.02516C11.9644 5.51465 12.2977 6.13829 12.4327 6.81722C12.5678 7.49615 12.4985 8.19989 12.2336 8.83943C11.9687 9.47897 11.5201 10.0256 10.9445 10.4102C10.3689 10.7948 9.69223 11 9 11C8.07174 11 7.1815 10.6313 6.52513 9.97491C5.86875 9.31853 5.5 8.42829 5.5 7.50004ZM7.5 7.50004C7.5 7.79671 7.58797 8.08672 7.7528 8.33339C7.91762 8.58007 8.15189 8.77232 8.42597 8.88586C8.70006 8.99939 9.00166 9.02909 9.29264 8.97121C9.58361 8.91334 9.85088 8.77048 10.0607 8.5607C10.2704 8.35092 10.4133 8.08364 10.4712 7.79267C10.5291 7.5017 10.4994 7.2001 10.3858 6.92601C10.2723 6.65192 10.08 6.41765 9.83335 6.25283C9.58668 6.08801 9.29667 6.00004 9 6.00004C8.60218 6.00004 8.22064 6.15807 7.93934 6.43938C7.65804 6.72068 7.5 7.10221 7.5 7.50004ZM16 17V19H2V17C2 17 2 13 9 13C16 13 16 17 16 17ZM14 17C13.86 16.22 12.67 15 9 15C5.33 15 4.07 16.31 4 17M15.95 13C16.5629 13.4768 17.064 14.0819 17.4182 14.7729C17.7723 15.4639 17.9709 16.2241 18 17V19H22V17C22 17 22 13.37 15.94 13H15.95Z"
                      fill="black"
                      fillOpacity="0.48"
                    />
                  </svg>
                  <span className="hidden sm:inline">0</span>
                  <span className="sm:hidden">0</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4 sm:w-6 sm:h-6"
                  >
                    <path
                      d="M21.9199 6.62C21.8185 6.37565 21.6243 6.18147 21.3799 6.08C21.2597 6.02876 21.1306 6.00158 20.9999 6H15.9999C15.7347 6 15.4804 6.10536 15.2928 6.29289C15.1053 6.48043 14.9999 6.73478 14.9999 7C14.9999 7.26522 15.1053 7.51957 15.2928 7.70711C15.4804 7.89464 15.7347 8 15.9999 8H18.5899L12.9999 13.59L9.70994 10.29C9.61698 10.1963 9.50637 10.1219 9.38452 10.0711C9.26266 10.0203 9.13195 9.9942 8.99994 9.9942C8.86793 9.9942 8.73722 10.0203 8.61536 10.0711C8.4935 10.1219 8.3829 10.1963 8.28994 10.29L2.28994 16.29C2.19621 16.383 2.12182 16.4936 2.07105 16.6154C2.02028 16.7373 1.99414 16.868 1.99414 17C1.99414 17.132 2.02028 17.2627 2.07105 17.3846C2.12182 17.5064 2.19621 17.617 2.28994 17.71C2.3829 17.8037 2.4935 17.8781 2.61536 17.9289C2.73722 17.9797 2.86793 18.0058 2.99994 18.0058C3.13195 18.0058 3.26266 17.9797 3.38452 17.9289C3.50637 17.8781 3.61698 17.8037 3.70994 17.71L8.99994 12.41L12.2899 15.71C12.3829 15.8037 12.4935 15.8781 12.6154 15.9289C12.7372 15.9797 12.8679 16.0058 12.9999 16.0058C13.132 16.0058 13.2627 15.9797 13.3845 15.9289C13.5064 15.8781 13.617 15.8037 13.7099 15.71L19.9999 9.41V12C19.9999 12.2652 20.1053 12.5196 20.2928 12.7071C20.4804 12.8946 20.7347 13 20.9999 13C21.2652 13 21.5195 12.8946 21.707 12.7071C21.8946 12.5196 21.9999 12.2652 21.9999 12V7C21.9984 6.86932 21.9712 6.74022 21.9199 6.62Z"
                      fill="black"
                      fillOpacity="0.48"
                    />
                  </svg>

                  <span className="hidden sm:inline">{tpl.type}</span>
                  <span className="sm:hidden text-xs">{tpl.type}</span>
                </div>
              </div>
              <button className="bg-[#A594F9] text-white rounded-lg px-4 sm:px-6 py-2 sm:py-3 w-full text-xs sm:text-base lg:text-lg font-medium flex items-center justify-center gap-2 mt-auto hover:bg-[#9280FF] transition">
                Use Template
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

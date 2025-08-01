"use client";
import React, { useState, useRef, useEffect } from "react";
import {
  FaPlayCircle,
  FaEdit,
  FaShareAlt,
  FaTrash,
  FaTh,
  FaThList,
  FaFilter,
  FaSort,
  FaEllipsisV,
  FaEye,
  FaRegCalendarAlt,
  FaListUl,
  FaRegFileAlt,
  FaArrowUp,
  FaArrowDown,
  FaRegClock,
  FaPlusSquare,
} from "react-icons/fa";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";

const demoData = [
  {
    title: "Demo 1",
    description: "No description",
    status: "Draft",
    views: 0,
    updated: "10 June 2025",
  },
  {
    title: "Demo 2",
    description: "No description",
    status: "Draft",
    views: 0,
    updated: "10 June 2025",
  },
];

export default function DemosPage() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [topSearch, setTopSearch] = useState("");

  const initials = React.useMemo(() => {
    if (session?.user?.name) {
      return session.user.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return session?.user?.email?.[0].toUpperCase() || "U";
  }, [session?.user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(event.target as Node)
      ) {
        setStatusDropdownOpen(false);
      }
      if (
        sortDropdownRef.current &&
        !sortDropdownRef.current.contains(event.target as Node)
      ) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-[#F3F0FC]">
      <div className="w-full bg-white border-b border-gray-200 flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-3">
          <FaPlayCircle className="text-[#A594F9] text-2xl" />
          <span className="text-lg text-gray-400 font-medium">My Demos</span>
        </div>

        <div className="hidden md:flex justify-center flex-1">
          <input
            type="text"
            placeholder="Search"
            value={topSearch}
            onChange={(e) => setTopSearch(e.target.value)}
            className="px-4 py-2 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#6356D7] bg-white text-gray-700 w-56 shadow-sm transition-all"
          />
        </div>

        <div className="flex items-center gap-6">
          <span className="text-gray-500 text-lg">
            Welcome{" "}
            <span className="text-[#7C5CFC] font-semibold">
              {session?.user?.name?.split(" ")[0] ||
                session?.user?.email?.split("@")[0] ||
                "User"}
            </span>{" "}
            <span className="inline-block">👋</span>
          </span>
          <button
            className="relative p-2 rounded-full hover:bg-[#F1ECFF] transition-colors focus:outline-none"
            title="Notifications"
          >
            <Image
              src="/icons/bell.png"
              alt="Notifications"
              width={24}
              height={24}
              className="w-6 h-6"
            />
          </button>
          <div className="relative" ref={dropdownRef}>
            <button
              className="w-10 h-10 rounded-full bg-[#7C5CFC] text-white flex items-center justify-center text-lg font-bold shadow cursor-pointer border-4 border-white hover:scale-105 transition-all"
              onClick={() => setShowDropdown((v) => !v)}
              title={session?.user?.name || session?.user?.email || undefined}
            >
              {initials}
            </button>
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg p-3 z-50 border border-gray-200 animate-fade-in">
                <div className="mb-2 text-base font-bold text-[#6356D7]">
                  {session?.user?.name || "User"}
                </div>
                <div className="mb-1 text-gray-700 text-xs font-semibold">
                  {session?.user?.email}
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="mt-3 w-full px-3 py-2 bg-[#6356D7] text-white rounded hover:bg-[#7E5FFF] font-semibold transition-all text-sm"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="bg-[#F3F0FC] rounded-xl p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-normal text-[#8B8B8B] mb-2">
            Manage and organize all your interactive demos.
          </h2>
          <div className="flex flex-wrap gap-4 items-center mt-6">
            <input
              type="text"
              placeholder="Search your demos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[300px] px-4 py-3 rounded-lg bg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#A594F9]"
            />
            <div className="relative">
              <button
                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-white border border-gray-200 text-[#A594F9] font-medium hover:bg-[#ede7fa]"
                onClick={() => setStatusDropdownOpen((v) => !v)}
              >
                <FaFilter className="text-lg" /> All Status
              </button>
              {statusDropdownOpen && (
                <div
                  ref={statusDropdownRef}
                  className="absolute left-0 top-full mt-2 bg-white rounded-2xl shadow-lg p-4 z-50 border border-gray-100 min-w-[180px] animate-fade-in"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-[#A594F9] text-base font-medium cursor-pointer px-2 py-2 rounded-lg hover:bg-[#F3F0FC]">
                      <Image
                        src="/icons/all-status.svg"
                        alt="Notifications"
                        width={24}
                        height={24}
                        className="w-6 h-6"
                      />{" "}
                      All Status
                    </div>
                    <div className="flex items-center gap-3 text-[#A594F9] text-base font-medium cursor-pointer px-2 py-2 rounded-lg hover:bg-[#F3F0FC]">
                      <FaRegFileAlt className="text-lg" /> Draft
                    </div>
                    <div className="flex items-center gap-3 text-[#A594F9] text-base font-medium cursor-pointer px-2 py-2 rounded-lg hover:bg-[#F3F0FC]">
                      <Image
                        src="/icons/publish.svg"
                        alt="Notifications"
                        width={24}
                        height={24}
                        className="w-6 h-6"
                      />{" "}
                      Published
                    </div>
                    <div className="flex items-center gap-3 text-[#A594F9] text-base font-medium cursor-pointer px-2 py-2 rounded-lg hover:bg-[#F3F0FC]">
                      <Image
                        src="/icons/aarcheive.svg"
                        alt="Notifications"
                        width={24}
                        height={24}
                        className="w-6 h-6"
                      />{" "}
                      Archived
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <button
                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-white border border-gray-200 text-[#A594F9] font-medium hover:bg-[#ede7fa]"
                onClick={() => setSortDropdownOpen((v) => !v)}
              >
                <FaSort className="text-lg" /> Sort By
              </button>
              {sortDropdownOpen && (
                <div
                  ref={sortDropdownRef}
                  className="absolute left-0 top-full mt-2 bg-white rounded-2xl shadow-lg p-4 z-50 border border-gray-100 min-w-[180px] animate-fade-in"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-[#A594F9] text-base font-medium cursor-pointer px-2 py-2 rounded-lg hover:bg-[#F3F0FC]">
                      <FaListUl className="text-lg" /> Title
                    </div>
                    <div className="flex items-center gap-3 text-[#A594F9] text-base font-medium cursor-pointer px-2 py-2 rounded-lg hover:bg-[#F3F0FC]">
                      <FaRegClock className="text-lg" /> Last Updated
                    </div>
                    <div className="flex items-center gap-3 text-[#A594F9] text-base font-medium cursor-pointer px-2 py-2 rounded-lg hover:bg-[#F3F0FC]">
                      <FaPlusSquare className="text-lg" /> Created date
                    </div>
                    <div className="flex items-center gap-3 text-[#A594F9] text-base font-medium cursor-pointer px-2 py-2 rounded-lg hover:bg-[#F3F0FC]">
                      <FaEye className="text-lg" /> Views
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 ml-auto">
              <button
                className={`p-3 rounded-lg border ${
                  view === "grid"
                    ? "bg-[#A594F9] text-white"
                    : "bg-white text-[#A594F9] border-gray-200"
                }`}
                onClick={() => setView("grid")}
              >
                <FaTh className="text-xl" />
              </button>
              <button
                className={`p-3 rounded-lg border ${
                  view === "list"
                    ? "bg-[#A594F9] text-white"
                    : "bg-white text-[#A594F9] border-gray-200"
                }`}
                onClick={() => setView("list")}
              >
                <FaThList className="text-xl" />
              </button>
            </div>
          </div>
        </div>
        <div className="mt-8">
          <h3 className="text-3xl font-semibold text-[#1A0033] mb-6">
            Your Demos
          </h3>
          <div className="flex justify-end text-[#A594F9] mb-2 font-medium">
            {demoData.length}/2 demos
          </div>
          {view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-8">
              {demoData.map((demo) => (
                <div
                  key={demo.title}
                  className="bg-white rounded-2xl p-8 flex flex-col h-full shadow-sm"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-2xl text-[#8B8B8B] font-normal">
                      {demo.title}
                    </div>
                    <div className="flex items-center gap-4">
                      <button className="text-[#A594F9] hover:text-[#7C6FEF] text-xl">
                        <FaEdit />
                      </button>
                      <button className="text-[#A594F9] hover:text-[#7C6FEF] text-xl">
                        <FaEllipsisV />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center justify-center bg-[#F8F6FF] rounded-xl mb-6 min-h-[180px]">
                    <Image
                      src="/icons/play-demo.svg"
                      alt="Notifications"
                      width={24}
                      height={24}
                      className="w-6 h-6"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[#8B8B8B] text-base mb-4">
                    <div className="flex items-center gap-2">
                      <FaEye className="text-lg" /> 0
                    </div>
                    <div className="flex items-center gap-2">
                      <FaRegCalendarAlt className="text-lg" /> 10 June 2025
                    </div>
                    <div>Draft</div>
                  </div>
                  <button className="bg-[#A594F9] text-white rounded-lg px-6 py-3 w-full text-lg font-medium flex items-center justify-center gap-2 mt-auto">
                    <FaShareAlt /> Share
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[#F3F0FC] text-[#8B8B8B] text-lg">
                  <tr>
                    <th className="py-4 px-6 font-medium">Demos</th>
                    <th className="py-4 px-6 font-medium">Status</th>
                    <th className="py-4 px-6 font-medium">Views</th>
                    <th className="py-4 px-6 font-medium">Updated</th>
                    <th className="py-4 px-6 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {demoData.map((demo) => (
                    <tr
                      key={demo.title}
                      className="border-t border-[#F3F0FC] hover:bg-[#F8F6FF]"
                    >
                      <td className="py-4 px-6 flex items-center gap-4">
                        <span className="inline-flex items-center justify-center w-14 h-14 bg-[#E5DEFF] rounded-xl">
                          <Image
                            src="/icons/play-demo.svg"
                            alt="Notifications"
                            width={24}
                            height={24}
                            className="w-6 h-6"
                          />{" "}
                        </span>
                        <div>
                          <div className="font-semibold text-lg text-[#1A0033]">
                            {demo.title}
                          </div>
                          <div className="text-[#8B8B8B] text-sm">
                            {demo.description}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-[#8B8B8B] font-medium">
                        {demo.status}
                      </td>
                      <td className="py-4 px-6 text-[#1A0033] font-bold">
                        {demo.views}
                      </td>
                      <td className="py-4 px-6 text-[#8B8B8B] font-medium">
                        {demo.updated}
                      </td>
                      <td className="py-4 px-6 flex gap-4 items-center">
                        <button className="text-[#A594F9] hover:text-[#7C6FEF] text-xl">
                          <FaEdit />
                        </button>
                        <button className="text-[#A594F9] hover:text-[#7C6FEF] text-xl">
                          <FaShareAlt />
                        </button>
                        <button className="text-red-400 hover:text-red-600 text-xl">
                          <Image
                            src="/icons/delete-demo.svg"
                            alt="Notifications"
                            width={24}
                            height={24}
                            className="w-6 h-6"
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import {
  FaPlayCircle,
  FaShareAlt,
  FaTh,
  FaThList,
  FaFilter,
  FaSort,
  FaEye,
  FaRegCalendarAlt,
  FaListUl,
  FaRegFileAlt,
  FaRegClock,
  FaPlusSquare,
} from "react-icons/fa";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { formatDate, formatTime_2 } from "@/app/lib/dateTimeUtils";
import ConfirmDeleteModal from "../../components/ConfirmDeleteModal";

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

export default function DemosPage() {
  const router = useRouter();
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
  const [demos, setDemos] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const initials = useMemo(() => {
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

  const fetchDemos = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get("/api/demo");
      setDemos(response.data.demos || []);
    } catch (err: unknown) {
      console.error("Error fetching demos:", err);

      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Failed to fetch demos");
      } else {
        setError("Failed to fetch demos");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDemos();
  }, []);

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

  // Filter demos based on search
  const filteredDemos = demos.filter(
    (demo) =>
      demo.title.toLowerCase().includes(search.toLowerCase()) ||
      demo.description.toLowerCase().includes(search.toLowerCase())
  );

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

  const handleDeleteDemo = (id: string) => {
    setDeleteId(id);
    setIsModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await axios.delete(`/api/demo/`, {
        params: {
          id: deleteId,
        },
      });
      await fetchDemos();
    } catch (error) {
      console.error("Error deleting demo:", error);
      setError("Failed to delete demo");
    } finally {
      setIsModalOpen(false);
      setDeleteId(null);
    }
  };

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
            {filteredDemos.length}/{demos.length} demos
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-[#A594F9] text-lg">Loading demos...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-500 text-lg">{error}</div>
            </div>
          ) : filteredDemos.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-[#8B8B8B] text-lg">No demos found</div>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-8">
              {filteredDemos.map((demo: Demo) => (
                <div
                  key={demo.id}
                  className="bg-white rounded-2xl p-8 flex flex-col h-full shadow-sm cursor-pointer hover:shadow-md transition"
                  onClick={() => handleEditDemo(demo)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-2xl text-[#8B8B8B] font-normal">
                      {demo.title}
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        className="text-red-400 hover:text-red-600 text-xl"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDemo(demo.id);
                        }}
                      >
                        <Image
                          src="/icons/delete-demo.svg"
                          alt="Delete"
                          width={24}
                          height={24}
                          className="w-6 h-6"
                        />
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
                      <FaRegCalendarAlt className="text-lg" />{" "}
                      {formatDate(demo.updatedAt)}
                    </div>
                    <div>Draft</div>
                  </div>
                  <div className="text-sm text-[#8B8B8B] mb-4">
                    <div>
                      Duration: {formatTime_2(demo.startTime)} -{" "}
                      {formatTime_2(demo.endTime)}
                    </div>
                    <div className="truncate">
                      {demo.description || "No description"}
                    </div>
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
                    {/* <th className="py-4 px-6 font-medium">Duration</th> */}
                    <th className="py-4 px-6 font-medium">Status</th>
                    <th className="py-4 px-6 font-medium">Updated</th>
                    <th className="py-4 px-6 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDemos.map((demo: Demo) => (
                    <tr
                      key={demo.id}
                      className="border-t border-[#F3F0FC] hover:bg-[#F8F6FF] cursor-pointer"
                      onClick={() => handleEditDemo(demo)}
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
                            {demo.description || "No description"}
                          </div>
                        </div>
                      </td>
                      {/* <td className="py-4 px-6 text-[#8B8B8B] font-medium">
                        {formatTime(demo.startTime)} -{" "}
                        {formatTime(demo.endTime)}
                      </td> */}
                      <td className="py-4 px-6 text-[#8B8B8B] font-medium">
                        Draft
                      </td>
                      <td className="py-4 px-6 text-[#8B8B8B] font-medium">
                        {formatDate(demo.updatedAt)}
                      </td>
                      <td className="py-4 px-6 flex gap-4 items-center">
                        <button
                          className="text-[#A594F9] hover:text-[#7C6FEF] text-xl cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FaShareAlt />
                        </button>
                        <button
                          className="text-red-400 hover:text-red-600 text-xl cursor-pointer"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDemo(demo.id);
                          }}
                        >
                          <Image
                            src="/icons/delete-demo.svg"
                            alt="Delete"
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

      <ConfirmDeleteModal
        isOpen={isModalOpen}
        onConfirm={confirmDelete}
        onCancel={() => setIsModalOpen(false)}
      />
    </div>
  );
}

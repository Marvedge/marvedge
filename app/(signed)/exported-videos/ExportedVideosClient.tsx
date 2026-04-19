"use client";

import { useState, useRef, useEffect } from "react";
import {
  FaShareAlt,
  FaTh,
  FaThList,
  FaSort,
  FaEye,
  FaRegCalendarAlt,
  FaListUl,
  FaRegClock,
  FaPlusSquare,
} from "react-icons/fa";
import Image from "next/image";
import axios from "axios";
import { formatDate } from "@/app/lib/dateTimeUtils";
import ConfirmDeleteModal from "../../components/ConfirmDeleteModal";
import ShareModal from "../../components/ShareModal";

interface ExportedVideo {
  id: string;
  title: string;
  description: string | null;
  exportedUrl: string;
  shareableUrl: string;
  createdAt: string;
  updatedAt: string;
}

export default function ExportedVideosClient() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list");
  const [, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [videos, setVideos] = useState<ExportedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [shareVideo, setShareVideo] = useState<Pick<ExportedVideo, "id" | "title"> | null>(null);
  const [sortOption, setSortOption] = useState<"title" | "updatedAt" | "createdAt" | "views">(
    "updatedAt"
  );

  const fetchExportedVideos = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get("/api/exported-videos");
      setVideos(response.data.exportedVideos || []);
    } catch (err: unknown) {
      console.error("Error fetching exported videos:", err);
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Failed to fetch exported videos");
      } else {
        setError("Failed to fetch exported videos");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExportedVideos();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredAndSortedVideos = videos
    .filter(
      (video) =>
        video.title.toLowerCase().includes(search.toLowerCase()) ||
        (video.description || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortOption === "title") {
        return a.title.localeCompare(b.title);
      } else if (sortOption === "updatedAt") {
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      } else if (sortOption === "createdAt") {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      } else if (sortOption === "views") {
        return 0; // Views sorting logic fallback
      }
      return 0;
    });

  const openVideo = (url: string) => {
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDeleteVideo = (id: string) => {
    setDeleteId(id);
    setIsModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) {
      return;
    }
    try {
      await axios.delete("/api/exported-videos", {
        params: { id: deleteId },
      });
      await fetchExportedVideos();
    } catch (deleteError) {
      console.error("Error deleting exported video:", deleteError);
      setError("Failed to delete exported video");
    } finally {
      setIsModalOpen(false);
      setDeleteId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F0FC]">
      <div className="bg-[#F3F0FC] rounded-xl p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-normal text-[#8B8B8B] mb-2">
            Manage and organize all your exported videos.
          </h2>
          <div className="flex flex-wrap items-center justify-between mt-6 gap-4">
            <input
              type="text"
              placeholder="Search your exported videos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[300px] px-4 py-3 rounded-lg bg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#A594F9]"
            />

            <div className="flex items-center gap-6 ml-auto">
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
                      <div
                        onClick={() => {
                          setSortOption("title");
                          setSortDropdownOpen(false);
                        }}
                        className={`flex items-center gap-3 text-base font-medium cursor-pointer px-2 py-2 rounded-lg hover:bg-[#F3F0FC] ${sortOption === "title" ? "text-purple-700 bg-purple-50" : "text-[#A594F9]"}`}
                      >
                        <FaListUl className="text-lg" /> Title
                      </div>
                      <div
                        onClick={() => {
                          setSortOption("updatedAt");
                          setSortDropdownOpen(false);
                        }}
                        className={`flex items-center gap-3 text-base font-medium cursor-pointer px-2 py-2 rounded-lg hover:bg-[#F3F0FC] ${sortOption === "updatedAt" ? "text-purple-700 bg-purple-50" : "text-[#A594F9]"}`}
                      >
                        <FaRegClock className="text-lg" /> Last Updated
                      </div>
                      <div
                        onClick={() => {
                          setSortOption("createdAt");
                          setSortDropdownOpen(false);
                        }}
                        className={`flex items-center gap-3 text-base font-medium cursor-pointer px-2 py-2 rounded-lg hover:bg-[#F3F0FC] ${sortOption === "createdAt" ? "text-purple-700 bg-purple-50" : "text-[#A594F9]"}`}
                      >
                        <FaPlusSquare className="text-lg" /> Created date
                      </div>
                      <div
                        onClick={() => {
                          setSortOption("views");
                          setSortDropdownOpen(false);
                        }}
                        className={`flex items-center gap-3 text-base font-medium cursor-pointer px-2 py-2 rounded-lg hover:bg-[#F3F0FC] ${sortOption === "views" ? "text-purple-700 bg-purple-50" : "text-[#A594F9]"}`}
                      >
                        <FaEye className="text-lg" /> Views
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
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
        </div>

        <div className="mt-8">
          <h3 className="text-3xl font-semibold text-[#1A0033] mb-6">Exported Videos</h3>
          <div className="flex justify-end text-[#A594F9] mb-2 font-medium">
            {filteredAndSortedVideos.length}/{videos.length} videos
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-[#A594F9] text-lg">Loading exported videos...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-500 text-lg">{error}</div>
            </div>
          ) : filteredAndSortedVideos.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-[#8B8B8B] text-lg">No exported videos found</div>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-8">
              {filteredAndSortedVideos.map((video) => (
                <div
                  key={video.id}
                  className="bg-white rounded-2xl p-8 flex flex-col h-full shadow-sm cursor-pointer hover:shadow-md transition"
                  onClick={() => openVideo(video.exportedUrl)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-2xl text-[#8B8B8B] font-normal">{video.title}</div>
                    <div className="flex items-center gap-4">
                      <button
                        className="text-red-400 hover:text-red-600 text-xl"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVideo(video.id);
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
                      alt="Preview"
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
                      <FaRegCalendarAlt className="text-lg" /> {formatDate(video.updatedAt)}
                    </div>
                    <div>Published</div>
                  </div>
                  <div className="text-sm text-[#8B8B8B] mb-4">
                    <div className="truncate">{video.description || "No description"}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShareVideo({ id: video.id, title: video.title });
                    }}
                    className="bg-[#A594F9] text-white rounded-lg px-6 py-3 w-full text-lg font-medium flex items-center justify-center gap-2 mt-auto cursor-pointer"
                  >
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
                    <th className="py-4 px-6 font-medium">Videos</th>
                    <th className="py-4 px-6 font-medium">Status</th>
                    <th className="py-4 px-6 font-medium">Updated</th>
                    <th className="py-4 px-6 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedVideos.map((video) => (
                    <tr
                      key={video.id}
                      className="border-t border-[#F3F0FC] hover:bg-[#F8F6FF] cursor-pointer"
                      onClick={() => openVideo(video.exportedUrl)}
                    >
                      <td className="py-4 px-6 flex items-center gap-4">
                        <span className="inline-flex items-center justify-center w-14 h-14 bg-[#E5DEFF] rounded-xl">
                          <Image
                            src="/icons/play-demo.svg"
                            alt="Preview"
                            width={24}
                            height={24}
                            className="w-6 h-6"
                          />
                        </span>
                        <div>
                          <div className="font-semibold text-lg text-[#1A0033]">{video.title}</div>
                          <div className="text-[#8B8B8B] text-sm">
                            {video.description || "No description"}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-[#8B8B8B] font-medium">Published</td>
                      <td className="py-4 px-6 text-[#8B8B8B] font-medium">
                        {formatDate(video.updatedAt)}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex gap-4 items-center justify-center">
                          <button
                            className="text-[#A594F9] hover:text-[#7C6FEF] text-xl cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShareVideo({ id: video.id, title: video.title });
                            }}
                          >
                            <FaShareAlt />
                          </button>
                          <button
                            className="text-red-400 hover:text-red-600 text-xl cursor-pointer"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteVideo(video.id);
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
      {shareVideo && (
        <ShareModal
          apiPath={`/api/exported-videos/${shareVideo.id}/share`}
          title={shareVideo.title}
          onClose={() => setShareVideo(null)}
        />
      )}
    </div>
  );
}

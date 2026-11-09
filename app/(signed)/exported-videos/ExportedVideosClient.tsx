"use client";

import { useState, useRef, useEffect } from "react";
import ConfirmDeleteModal from "../../components/ConfirmDeleteModal";
import ShareModal from "../../components/ShareModal";
import { isSafePreviewUrl } from "@/app/preview/utils/previewHelpers";
import { useExportedVideos } from "./hooks/useExportedVideos";
import { filterAndSortVideos } from "./utils/videoHelpers";
import VideosToolbar from "./components/VideosToolbar";
import VideoGridView from "./components/VideoGridView";
import VideoListView from "./components/VideoListView";
import type { ExportedVideo, VideoSortOption } from "./types";

export default function ExportedVideosClient() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list");
  const [, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [shareVideo, setShareVideo] = useState<Pick<ExportedVideo, "id" | "title"> | null>(null);
  const [sortOption, setSortOption] = useState<VideoSortOption>("updatedAt");

  const { videos, loading, error, deleteVideo } = useExportedVideos();

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

  const filteredAndSortedVideos = filterAndSortVideos(videos, search, sortOption);

  const openVideo = (url: string) => {
    if (!isSafePreviewUrl(url)) {
      return;
    }
    window.open(url.trim(), "_blank", "noopener,noreferrer");
  };

  const handleDeleteVideo = (id: string) => {
    setDeleteId(id);
    setIsModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) {
      return;
    }
    await deleteVideo(deleteId);
    setIsModalOpen(false);
    setDeleteId(null);
  };

  return (
    <div className="shared-videos-page min-h-screen bg-[#F3F0FC]">
      <div className="page-body bg-[#F3F0FC] rounded-xl p-8">
        <div className="mb-8">
          <h2 className="shared-subtitle text-2xl font-normal text-[#8B8B8B] mb-2">
            Manage and organize all your shared videos.
          </h2>
          <VideosToolbar
            search={search}
            setSearch={setSearch}
            sortDropdownOpen={sortDropdownOpen}
            setSortDropdownOpen={setSortDropdownOpen}
            sortDropdownRef={sortDropdownRef}
            sortOption={sortOption}
            setSortOption={setSortOption}
            view={view}
            setView={setView}
          />
        </div>

        <div className="mt-8">
          <h3 className="shared-title text-3xl font-semibold text-[#1A0033] mb-6">Shared Videos</h3>
          <div className="shared-count flex justify-end text-[#A594F9] mb-2 font-medium">
            {filteredAndSortedVideos.length}/{videos.length} videos
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="shared-count text-[#A594F9] text-lg">Loading exported videos...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-500 text-lg">{error}</div>
            </div>
          ) : filteredAndSortedVideos.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="shared-card-desc text-[#8B8B8B] text-lg">
                No exported videos found
              </div>
            </div>
          ) : view === "grid" ? (
            <VideoGridView
              videos={filteredAndSortedVideos}
              onOpen={openVideo}
              onDelete={handleDeleteVideo}
              onShare={(video) => setShareVideo({ id: video.id, title: video.title })}
            />
          ) : (
            <VideoListView
              videos={filteredAndSortedVideos}
              onOpen={openVideo}
              onDelete={handleDeleteVideo}
              onShare={(video) => setShareVideo({ id: video.id, title: video.title })}
            />
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

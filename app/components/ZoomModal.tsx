import React from "react";
import { X } from "lucide-react";
import { ZoomEffect } from "../types/editor/zoom-effect";
//import ReactPlayer from "react-player";

interface ModalProps {
  //isOpen: boolean;
  onClose: () => void;
  activeZoomIdx: number;
  zoomSegments: ZoomEffect[];
  setZoomSegments: React.Dispatch<React.SetStateAction<ZoomEffect[]>>;
  // videourl: string;
  // playerRef: React.RefObject<ReactPlayer>;
}

export default function ZoomModal({
  //isOpen,
  onClose,
  activeZoomIdx,
  setZoomSegments,
  zoomSegments,
}: ModalProps) {
  // if (!isOpen) {
  //   return null;
  // }

  const handleOnChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "2xZoom") {
      setZoomSegments((prev) =>
        prev.map((seg, index) => (index === activeZoomIdx ? { ...seg, zoomLevel: 2 } : seg))
      );
      //setZoomLevel(2);
    } else if (value === "3xZoom") {
      setZoomSegments((prev) =>
        prev.map((seg, index) => (index === activeZoomIdx ? { ...seg, zoomLevel: 3 } : seg))
      );
      //setZoomLevel(3);
    } else if (value === "4xZoom") {
      setZoomSegments((prev) =>
        prev.map((seg, index) => (index === activeZoomIdx ? { ...seg, zoomLevel: 4 } : seg))
      );
      //setZoomLevel(4);
    }
  };
  return (
    <div className="absolute inset-0 z-50 pt-10 flex items-start justify-center">
      {/* Background blur */}
      <div onClick={onClose} className="absolute inset-0 backdrop-blur-md bg-black/30" />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl p-8 w-[480px] max-w-[92%] z-50">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100"
        >
          <X className="h-6 w-6 text-gray-700" />
        </button>

        {/* Title */}
        <h2 className="text-3xl font-semibold mb-6">Zoom</h2>

        {/* Segment Control */}
        <div className="flex bg-gray-100 rounded-full p-1 mb-6">
          <button className="flex-1 py-2 rounded-full bg-white shadow text-sm font-medium">
            Segment
          </button>
          <button className="flex-1 py-2 text-sm font-medium text-gray-500">Global</button>
        </div>

        {/* Options */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-gray-600 text-sm mb-1 block">Depth</label>
            <select
              className="w-full border rounded-lg p-2 text-sm"
              value={zoomSegments[activeZoomIdx].zoomLevel + "xZoom"}
              onChange={(e) => handleOnChange(e)}
            >
              <option value="2xZoom">Shallow</option>
              <option value="3xZoom">Medium</option>
              <option value="4xZoom">Deep</option>
            </select>
          </div>

          <div>
            <label className="text-gray-600 text-sm mb-1 block">Position</label>
            <select className="w-full border rounded-lg p-2 text-sm">
              <option>Fixed</option>
              <option>Floating</option>
            </select>
          </div>
        </div>

        {/* Preview Block */}
        <div className="w-full h-48 bg-gray-200 rounded-xl flex items-center justify-center border overflow-hidden relative"></div>
      </div>
    </div>
  );
}

// TUTORIAL SLIDESHOW FEATURE COMMENTED OUT - Not used in standard recording mode
/*
"use client";
import React, { useState, useCallback } from "react";
import Image from "next/image";
import { Slide } from "../hooks/useInteractionRecorder";
import { ChevronLeft, ChevronRight, Edit2, Trash2, Plus } from "lucide-react";

interface SlideshowViewerProps {
  slides: Slide[];
  onUpdateSlide?: (slideId: string, updates: Partial<Slide>) => void;
  onDeleteSlide?: (slideId: string) => void;
  onAddSlide?: () => void;
}

export const SlideshowViewer: React.FC<SlideshowViewerProps> = ({
  slides,
  onUpdateSlide,
  onDeleteSlide,
  onAddSlide,
}) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [showHighlight, setShowHighlight] = useState(false);

  const currentSlide = slides[currentSlideIndex];

  const handleNextSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => (prev < slides.length - 1 ? prev + 1 : prev));
  }, [slides.length]);

  const handlePreviousSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const handleEditClick = (slide: Slide) => {
    setEditingSlideId(slide.id);
    setEditTitle(slide.title);
    setEditDescription(slide.description);
  };

  const handleSaveEdit = () => {
    if (editingSlideId && onUpdateSlide) {
      onUpdateSlide(editingSlideId, {
        title: editTitle,
        description: editDescription,
      });
      setEditingSlideId(null);
    }
  };

  const handleDeleteSlide = (slideId: string) => {
    if (onDeleteSlide) {
      onDeleteSlide(slideId);
      if (currentSlideIndex >= slides.length - 1 && currentSlideIndex > 0) {
        setCurrentSlideIndex(currentSlideIndex - 1);
      }
    }
  };

  if (slides.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 text-lg">No slides recorded yet</p>
          <p className="text-gray-400 text-sm mt-2">Start recording to create slides</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-auto">
        <div className="relative bg-gray-900 flex items-center justify-center min-h-[600px]">
          <Image
            src={currentSlide.imageData}
            alt={`Slide ${currentSlideIndex + 1}`}
            width={1200}
            height={600}
            className="max-w-full max-h-full object-contain"
          />

          {showHighlight && currentSlide.clicks.length > 0 && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ mixBlendMode: "multiply" }}
            >
              {currentSlide.clicks.map((click, idx) => (
                <circle
                  key={idx}
                  cx={click.x}
                  cy={click.y}
                  r="40"
                  fill="none"
                  stroke="#ff6b6b"
                  strokeWidth="3"
                  opacity="0.8"
                  className="animate-pulse"
                />
              ))}
            </svg>
          )}
        </div>

        <div className="bg-white border-t border-gray-200 p-6">
          {editingSlideId === currentSlide.id ? (
            <div className="space-y-4">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Slide title"
              />
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-20"
                placeholder="Slide description"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingSlideId(null)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{currentSlide.title}</h2>
              <p className="text-gray-600 mt-2">{currentSlide.description}</p>

              {currentSlide.clicks.length > 0 && (
                <div className="mt-4 bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-900 text-sm mb-2">
                    Actions on this slide:
                  </h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    {currentSlide.clicks.map((click, idx) => (
                      <li key={idx}>
                        • Click at ({click.x}, {click.y})
                        {click.elementText && ` on "${click.elementText}"`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousSlide}
              disabled={currentSlideIndex === 0}
              className="p-2 hover:bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={20} />
            </button>

            <span className="text-sm font-medium text-gray-700">
              {currentSlideIndex + 1} / {slides.length}
            </span>

            <button
              onClick={handleNextSlide}
              disabled={currentSlideIndex === slides.length - 1}
              className="p-2 hover:bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHighlight(!showHighlight)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${showHighlight ? "bg-yellow-400 text-gray-900" : "bg-gray-200 text-gray-700"}`}
            >
              {showHighlight ? "Highlights: ON" : "Highlights: OFF"}
            </button>

            <button
              onClick={() => handleEditClick(currentSlide)}
              className="p-2 hover:bg-gray-200 rounded-lg"
              title="Edit slide"
            >
              <Edit2 size={18} />
            </button>

            <button
              onClick={() => handleDeleteSlide(currentSlide.id)}
              className="p-2 hover:bg-red-100 rounded-lg text-red-600"
              title="Delete slide"
            >
              <Trash2 size={18} />
            </button>

            {onAddSlide && (
              <button
                onClick={onAddSlide}
                className="p-2 hover:bg-gray-200 rounded-lg"
                title="Add new slide"
              >
                <Plus size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="flex gap-2 pb-2">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                onClick={() => setCurrentSlideIndex(idx)}
                className={`flex-shrink-0 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                  idx === currentSlideIndex
                    ? "border-blue-500 ring-2 ring-blue-300"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <Image
                  src={slide.imageData}
                  alt={`Thumbnail ${idx + 1}`}
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
*/

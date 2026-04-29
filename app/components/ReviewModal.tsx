"use client";

import React, { useState } from "react";
import { X, Star } from "lucide-react";
import { toast } from "sonner";

export default function ReviewModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    if (!content.trim()) {
      toast.error("Please write a review");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, content }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit review");
      }

      toast.success("Review submitted successfully!");
      onClose();
    } catch {
      toast.error("Error submitting review. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6 mt-2">
          <h2 className="text-2xl font-bold text-[#6356d7] mb-2">
            Liking Marvedge? Please leave a review
          </h2>
          <p className="text-gray-500 text-sm">
            Your feedback helps us build better tools for you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  className="focus:outline-none transition-transform hover:scale-110"
                >
                  <Star
                    size={32}
                    className={`${
                      star <= (hoverRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-200"
                    } transition-colors`}
                  />
                </button>
              ))}
            </div>
            <span className="text-sm font-medium text-gray-500 min-h-[20px]">
              {rating > 0 ? `${rating} out of 5 stars` : "Select a rating"}
            </span>
          </div>

          <div className="space-y-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What do you think about Marvedge?"
              className="w-full h-32 p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6356d7] focus:border-transparent resize-none text-gray-700"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-[#6356d7] hover:bg-[#5246b8] text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isSubmitting ? "Submitting..." : "Submit Review"}
          </button>
        </form>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { Star } from "lucide-react";

interface Review {
  id: string;
  rating: number;
  content: string;
  createdAt: string;
  user: {
    name: string | null;
    image: string | null;
    bio: string | null;
  } | null;
}

export default function LandingReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const res = await fetch("/api/reviews");
        if (res.ok) {
          const data = (await res.json()) as Review[];

          const topReviews = data.filter((review) => review.rating >= 4).slice(0, 6);
          setReviews(topReviews);
        }
      } catch (error) {
        console.error("Failed to fetch reviews:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchReviews();
  }, []);

  if (isLoading || reviews.length === 0) {
    return null;
  }

  return (
    <section id="reviews" className="bg-[#F6F5FB] py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-16">
        <div className="text-center max-w-3xl mx-auto space-y-6">
          <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight leading-tight">
            Loved by Teams
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Real feedback from product, marketing, and sales teams who use Marvedge to create
            engaging product demos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 relative rounded-full overflow-hidden bg-gray-100 shrink-0">
                  {review.user?.image ? (
                    <Image
                      src={review.user.image}
                      alt={review.user?.name || "User"}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#6356d7] text-white font-bold text-lg">
                      {(review.user?.name || "A")[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3
                    className="font-semibold text-gray-900 leading-none truncate"
                    title={review.user?.name || "Anonymous User"}
                  >
                    {review.user?.name || "Anonymous User"}
                  </h3>
                  {review.user?.bio && (
                    <p className="text-sm text-gray-500 mt-1 truncate">{review.user.bio}</p>
                  )}
                </div>
              </div>

              <div className="flex gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={16}
                    className={
                      star <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"
                    }
                  />
                ))}
              </div>

              <div className="text-gray-700 mt-2 flex-grow">
                <p className="whitespace-pre-line text-[15px] leading-relaxed">{review.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

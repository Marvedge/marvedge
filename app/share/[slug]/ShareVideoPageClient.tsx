"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { CSSProperties } from "react";

type ShareVideoPageClientProps = {
  title: string;
  description: string | null;
  videoUrl: string;
  backgroundStyle: CSSProperties;
  aspectRatio: string;
};

export default function ShareVideoPageClient({
  title,
  description,
  videoUrl,
  backgroundStyle,
  aspectRatio,
}: ShareVideoPageClientProps) {
  const { status } = useSession();
  const isLoggedIn = status === "authenticated";

  const ratioMap: Record<string, string> = {
    "16:9": "16 / 9",
    "1:1": "1 / 1",
    "4:5": "4 / 5",
    "9:16": "9 / 16",
    "3:4": "3 / 4",
  };

  const previewFrameAspectRatio =
    aspectRatio === "native" ? "16 / 9" : ratioMap[aspectRatio] || "16 / 9";
  const [w, h] = previewFrameAspectRatio.split("/").map((v) => Number(v.trim()));
  const previewRatioValue =
    Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w / h : 16 / 9;
  const isPortraitPreview = previewRatioValue < 1;
  const isSquarePreview = Math.abs(previewRatioValue - 1) < 0.05;

  const stageWidth = isPortraitPreview
    ? "min(420px, 52vw)"
    : isSquarePreview
      ? "min(700px, 74vw)"
      : "min(1120px, 94vw)";
  const stageHeight = isPortraitPreview ? "88%" : "84%";
  const stageMaxWidth = isPortraitPreview ? "46%" : isSquarePreview ? "62%" : "92%";

  return (
    <main className="min-h-screen bg-[#F2EDFF]">
      <header className="sticky top-0 z-20 border-b border-[#E5DCFF] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-[#6B5ED8]">
            <Image src="/icons/logo.png" alt="Marvedge logo" width={28} height={28} />
            <span className="text-sm font-bold uppercase tracking-[0.18em]">Marvedge</span>
          </Link>
          {!isLoggedIn && (
            <div className="flex items-center gap-3">
              <Link
                href="/auth/signin"
                className="rounded-full border border-[#D4CAFF] px-4 py-2 text-sm font-medium text-[#6F5FBC]"
              >
                Login
              </Link>
              <Link
                href="/auth/signup"
                className="rounded-full bg-[#6E5AD8] px-4 py-2 text-sm font-semibold text-white"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-semibold text-[#2A1D5C]">{title || "Untitled Demo"}</h1>
          {description ? <p className="mt-2 text-sm text-[#7A6FA8]">{description}</p> : null}
        </div>

        <div
          className="relative overflow-hidden rounded-[34px] border border-[#BEB0F8]/60 p-8 shadow-[0_28px_85px_rgba(76,57,162,0.22)]"
          style={backgroundStyle}
        >
          <div
            className="mx-auto flex w-full items-center justify-center overflow-hidden rounded-[22px] border border-white/30 bg-[#1A1338]/20 p-3 shadow-[0_16px_40px_rgba(22,16,54,0.35)] backdrop-blur-sm"
            style={{
              aspectRatio: "16 / 9",
              minHeight: "240px",
            }}
          >
            <div
              className="overflow-hidden rounded-[16px] bg-black/55"
              style={{
                width: stageWidth,
                maxWidth: stageMaxWidth,
                height: stageHeight,
                maxHeight: "74vh",
                aspectRatio: previewFrameAspectRatio,
              }}
            >
              <video
                className="h-full w-full object-contain"
                src={videoUrl}
                controls
                preload="metadata"
                playsInline
                controlsList="nodownload"
              />
            </div>
          </div>
        </div>

        {!isLoggedIn && (
          <div className="mt-10 text-center">
            <h2 className="text-2xl font-semibold text-[#2E215D]">New to Marvedge?</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-[#7E73AC]">
              Start making your demos today and share polished walkthroughs in minutes.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href="/auth/signup"
                className="rounded-full bg-[#6A56D8] px-6 py-2.5 text-sm font-semibold text-white"
              >
                Sign up
              </Link>
              <Link
                href="/auth/signin"
                className="rounded-full border border-[#CFC2FF] bg-white px-6 py-2.5 text-sm font-semibold text-[#5D4BC5]"
              >
                Login
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

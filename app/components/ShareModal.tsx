"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Link2, X } from "lucide-react";

interface Props {
  apiPath: string;
  title?: string;
  onClose: () => void;
}

export default function ShareModal({ apiPath, title, onClose }: Props) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headingTitle = useMemo(() => {
    if (!title?.trim()) {
      return "Share with Friends";
    }
    return `Share "${title.trim()}"`;
  }, [title]);

  useEffect(() => {
    const fetchShareUrl = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(apiPath, {
          method: "GET",
        });
        if (!res.ok) {
          throw new Error("Failed to generate share link");
        }
        const data = await res.json();
        if (!data?.shareUrl) {
          throw new Error("No share URL returned");
        }
        setLink(data.shareUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load share link");
      } finally {
        setLoading(false);
      }
    };

    fetchShareUrl().catch(() => {});
  }, [apiPath]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  async function handleCopy() {
    if (!link) {
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);

    fetch(apiPath, { method: "POST" }).catch(() => {});

    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(26,17,58,0.2)] backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[620px] rounded-[28px] border border-[#CFC4FF] bg-white px-8 pb-8 pt-12 shadow-[0_24px_70px_rgba(84,65,160,0.22)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close share modal"
          onClick={onClose}
          className="absolute right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#CFC4FF] text-[#9D8BEE] transition hover:bg-[#F3EEFF]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="pointer-events-none absolute -top-12 left-1/2 flex h-24 w-24 -translate-x-1/2 items-center justify-center rounded-full border border-[#CFC4FF] bg-white shadow-[0_8px_25px_rgba(132,108,234,0.2)]">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F4EFFF] text-[#8B72F8]">
            <Link2 className="h-7 w-7" />
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-[36px] font-semibold leading-tight text-[#2D1F61]">{headingTitle}</h2>
          <p className="mt-2 text-[15px] text-[#8C82B4]">Control who can access this demo</p>
        </div>

        <div className="mx-auto mt-8 max-w-[460px]">
          <label className="mb-2 block text-[26px] font-semibold text-[#2D1F61]">
            Share your link
          </label>
          <div className="flex items-center rounded-[10px] border border-[#D8CFFF] bg-white px-3 py-2 shadow-[0_3px_9px_rgba(88,62,182,0.1)]">
            <input
              value={
                loading ? "Generating secure link..." : error ? "Unable to generate link" : link
              }
              readOnly
              className="w-full border-0 bg-transparent text-[14px] text-[#6D6591] placeholder:text-[#B0A5D3] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              disabled={loading || !!error || !link}
              className="ml-3 inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#A58EFA] text-white transition hover:bg-[#8B72F8] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Copy share link"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          {copied && <p className="mt-2 text-sm font-medium text-[#6E56CF]">Copied to clipboard</p>}
        </div>
      </div>
    </div>
  );
}

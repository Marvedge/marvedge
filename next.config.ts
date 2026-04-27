import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@radix-ui/react-slider", "@headlessui/react"],
  },

  async headers() {
    return [
      {
        source: "/video-editor/(.*)", // Only apply these headers to pages that strictly need ffmpeg.wasm
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },

  webpack: (config, { isServer }) => {
    // Exclude server-only packages from client bundle
    if (!isServer) {
      config.externals = {
        ...config.externals,
        "fluent-ffmpeg": "fluent-ffmpeg",
        "ffmpeg-static": "ffmpeg-static",
      };
    } else {
      // For server, mark these as external to avoid module resolution issues
      config.externals = config.externals || [];
      config.externals.push("ffmpeg-static");
      // bullmq uses dynamic requires internally; externalize to avoid webpack "Critical dependency" warning.
      config.externals.push("bullmq");
    }
    return config;
  },
};

export default nextConfig;

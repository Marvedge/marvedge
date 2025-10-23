import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@radix-ui/react-slider", "@headlessui/react"],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },

  images: {
    domains: ["res.cloudinary.com", "lh3.googleusercontent.com"],
  },

  webpack: (config, { isServer }) => {
    // Exclude server-only packages from client bundle
    if (!isServer) {
      config.externals = {
        ...config.externals,
        "fluent-ffmpeg": "fluent-ffmpeg",
        "ffmpeg-static": "ffmpeg-static",
        "@ffmpeg/ffmpeg": "commonjs @ffmpeg/ffmpeg",
      };
    } else {
      // For server, mark these as external to avoid module resolution issues
      config.externals = config.externals || [];
      config.externals.push("ffmpeg-static");
    }
    return config;
  },
};

export default nextConfig;

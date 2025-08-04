import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },

  images: {
    domains: ["res.cloudinary.com", "lh3.googleusercontent.com", ], 
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.justwatch.com" },
      { protocol: "https", hostname: "www.justwatch.com" },
    ],
  },
};

export default nextConfig;

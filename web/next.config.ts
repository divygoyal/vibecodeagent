import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',  // Required for Docker deployment
  
  // Allow external images (user avatars)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
};

export default nextConfig;

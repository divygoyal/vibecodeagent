import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: false,
  // Prevent mapbox-gl worker from being transpiled (causes "w is not defined" error)
  webpack: (config) => {
    config.module?.rules?.push({
      test: /\.js$/,
      include: /node_modules\/mapbox-gl/,
      type: 'javascript/auto',
    });
    return config;
  },
  // Allow external images (user avatars)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  // Security + cache headers
  headers: async () => [
    {
      // Cache static assets (videos, images, fonts) for 1 year
      source: '/:path*.(mp4|webm|jpg|jpeg|png|gif|svg|ico|woff|woff2)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    {
      // All routes EXCEPT /embed/ — block iframing
      source: '/((?!embed/).*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.dodopayments.com https://api.mapbox.com https://www.googletagmanager.com https://www.google-analytics.com https://*.clarity.ms https://*.bing.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https: wss:; frame-src https://checkout.dodopayments.com; media-src 'self' blob:; worker-src blob:; child-src blob:;" },
      ],
    },
    {
      // Embed routes — allow iframing from any origin
      source: '/embed/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://*.clarity.ms https://*.bing.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https: wss:; frame-ancestors *; media-src 'self' blob:; worker-src blob:; child-src blob:;" },
      ],
    },
  ],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: false,
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
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.dodopayments.com https://api.mapbox.com https://www.googletagmanager.com https://www.google-analytics.com https://*.clarity.ms https://*.bing.com https://platform.twitter.com https://embed.reddit.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss:; frame-src 'self' https://checkout.dodopayments.com https://platform.twitter.com https://embed.reddit.com https://*.redditmedia.com https://www.reddit.com; media-src 'self' blob:; worker-src 'self' blob:; child-src 'self' blob: https://embed.reddit.com https://*.redditmedia.com;" },
      ],
    },
    {
      // Embed routes — allow iframing from any origin
      source: '/embed/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://*.clarity.ms https://*.bing.com https://platform.twitter.com https://embed.reddit.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss:; frame-src https://platform.twitter.com https://syndication.twitter.com https://embed.reddit.com https://*.redditmedia.com https://www.reddit.com; frame-ancestors *; media-src 'self' blob:; worker-src 'self' blob:; child-src blob: https://embed.reddit.com https://*.redditmedia.com;" },
      ],
    },
  ],
};

export default nextConfig;

import type { NextConfig } from "next";

// `https://static.cloudflareinsights.com` is whitelisted because Cloudflare
// auto-injects its RUM beacon on sites it proxies (trafficclaw.com is one).
// Without the whitelist the browser blocks the script and spams the console
// with CSP violations on every page load.
const DEFAULT_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.dodopayments.com https://api.mapbox.com https://www.googletagmanager.com https://www.google-analytics.com https://*.clarity.ms https://*.bing.com https://platform.twitter.com https://embed.reddit.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss:; frame-src 'self' https://checkout.dodopayments.com https://platform.twitter.com https://embed.reddit.com https://*.redditmedia.com https://www.reddit.com; media-src 'self' blob:; worker-src 'self' blob:; child-src 'self' blob: https://embed.reddit.com https://*.redditmedia.com;";
const EMBED_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://*.clarity.ms https://*.bing.com https://platform.twitter.com https://embed.reddit.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss:; frame-src https://platform.twitter.com https://syndication.twitter.com https://embed.reddit.com https://*.redditmedia.com https://www.reddit.com; frame-ancestors *; media-src 'self' blob:; worker-src 'self' blob:; child-src blob: https://embed.reddit.com https://*.redditmedia.com;";
const BASE_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];
const BLOCKED_FRAME_HEADERS = [
  ...BASE_SECURITY_HEADERS,
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: DEFAULT_CSP },
];
const EMBEDDABLE_HEADERS = [
  ...BASE_SECURITY_HEADERS,
  { key: 'Content-Security-Policy', value: EMBED_CSP },
];

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
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
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
      // Shared dashboards only become iframe-safe when embed=true is explicitly requested.
      source: '/share/:path*',
      missing: [{ type: 'query', key: 'embed', value: 'true' }],
      headers: BLOCKED_FRAME_HEADERS,
    },
    {
      // All non-share, non-embed routes stay blocked from iframing.
      source: '/((?!embed/|share/).*)',
      headers: BLOCKED_FRAME_HEADERS,
    },
    {
      // Embedded shared dashboards — allow iframing from any origin.
      source: '/share/:path*',
      has: [{ type: 'query', key: 'embed', value: 'true' }],
      headers: EMBEDDABLE_HEADERS,
    },
    {
      // Embed routes — allow iframing from any origin
      source: '/embed/:path*',
      headers: EMBEDDABLE_HEADERS,
    },
  ],
};

export default nextConfig;

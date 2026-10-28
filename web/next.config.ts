import type { NextConfig } from "next";

// `https://static.cloudflareinsights.com` is whitelisted because Cloudflare
// auto-injects its RUM beacon on sites it proxies (trafficclaw.com is one).
// Without the whitelist the browser blocks the script and spams the console
// with CSP violations on every page load.
// `https://embed.tawk.to https://*.tawk.to` whitelisted for the Tawk.to live
// chat widget — the embed URL loads runtime scripts from various subdomains.
// Frame-src includes Tawk so the chat-popup iframe renders. Style-src includes
// Tawk because the bubble launcher loads its own stylesheet — without it
// Tawk's JS reads clientHeight off an unsized element and crashes with
// "Cannot read properties of undefined", and the widget never paints.
// Intentionally NOT added to EMBED_CSP — we want the widget suppressed inside
// customer iframes (a silent CSP block there is the desired behaviour).
const DEFAULT_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.dodopayments.com https://api.mapbox.com https://www.googletagmanager.com https://www.google-analytics.com https://*.clarity.ms https://*.bing.com https://platform.twitter.com https://embed.reddit.com https://static.cloudflareinsights.com https://embed.tawk.to https://*.tawk.to; style-src 'self' 'unsafe-inline' https://*.tawk.to; img-src 'self' data: https: blob:; font-src 'self' data: https://fonts.gstatic.com https://*.tawk.to; connect-src 'self' https: wss:; frame-src 'self' https://checkout.dodopayments.com https://platform.twitter.com https://embed.reddit.com https://*.redditmedia.com https://www.reddit.com https://*.tawk.to; media-src 'self' blob:; worker-src 'self' blob:; child-src 'self' blob: https://embed.reddit.com https://*.redditmedia.com;";
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
  output: 'standalone',
  trailingSlash: false,
  // Local dev kit only (scripts/dev/up.sh): cap Turbopack's cache memory on the
  // shared box. Unset everywhere else, so production builds are unchanged.
  ...(process.env.TC_TURBOPACK_MEMORY_LIMIT_MB
    ? { experimental: { turbopackMemoryLimit: Number(process.env.TC_TURBOPACK_MEMORY_LIMIT_MB) * 1024 * 1024 } }
    : {}),
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
  // Removed and moved routes (redesign, DESIGN.md 4.3/4.4). Permanent, and the
  // query string is kept. The old single-site pages (/dashboard/analytics/*,
  // /dashboard/seo, /dashboard/audit) are NOT here: their target depends on the
  // user's current site, so middleware.ts redirects them (307) using the tc_site
  // cookie, with a client fallback in their layouts.
  redirects: async () => [
    // Telegram bot, bot blog, X / Reddit API pages, globe: removed from the app
    ...['bot', 'setup-bot', 'blog', 'x-api', 'reddit-api', 'globe'].flatMap((p) => [
      { source: `/dashboard/${p}`, destination: '/dashboard', permanent: true },
      { source: `/dashboard/${p}/:path*`, destination: '/dashboard', permanent: true },
    ]),
    // Separate share studio: sharing lives in Dashboards now
    { source: '/dashboard/share', destination: '/dashboard/dashboards', permanent: true },
    { source: '/dashboard/share/:path*', destination: '/dashboard/dashboards', permanent: true },
    // Weekly page became the weekly report email setting (DESIGN 4.1, 4.3)
    { source: '/dashboard/weekly', destination: '/dashboard/settings?tab=notifications', permanent: true },
    { source: '/dashboard/weekly/:path*', destination: '/dashboard/settings?tab=notifications', permanent: true },
    // AI chat is "Ask"
    { source: '/dashboard/ai-chat', destination: '/dashboard/ask', permanent: true },
    { source: '/dashboard/ai-chat/:path*', destination: '/dashboard/ask/:path*', permanent: true },
    // Product-spec names for the same pages
    { source: '/dashboard/portfolio', destination: '/dashboard', permanent: true },
    { source: '/dashboard/connect', destination: '/dashboard/connect-ai', permanent: true },
    // Marketing and embeds for removed features
    { source: '/x', destination: '/', permanent: true },
    { source: '/reddit', destination: '/', permanent: true },
    { source: '/globe', destination: '/', permanent: true },
    { source: '/embed/x/:path*', destination: '/', permanent: true },
    { source: '/embed/reddit/:path*', destination: '/', permanent: true },
    { source: '/demo/telegram', destination: '/demo', permanent: true },
    { source: '/demo/telegram-video', destination: '/demo', permanent: true },
    { source: '/demo/telegram/:path*', destination: '/demo', permanent: true },
    { source: '/share-popup-preview', destination: '/', permanent: true },
    // Features were folded into the home page (DESIGN 4.4)
    { source: '/features', destination: '/#product', permanent: true },
    { source: '/features/:path*', destination: '/#product', permanent: true },
    // Leaderboard settings moved out of Settings into their own page
    {
      source: '/dashboard/settings',
      has: [{ type: 'query', key: 'tab', value: 'leaderboard' }],
      destination: '/dashboard/leaderboard',
      permanent: true,
    },
  ],
  // Security + cache headers. TC_NOINDEX=1 (private previews, read at build
  // time) adds X-Robots-Tag: noindex, nofollow to every response; robots.ts
  // and sitemap.ts also check it at request time.
  headers: async () => [
    ...(process.env.TC_NOINDEX === '1'
      ? [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
      : []),
    {
      // Cache static assets (videos, images, fonts) for 1 year. Not /badge/<slug>.svg: that is generated per request
      // from live numbers and sets its own 1-hour cache (app/badge/[file]/route.ts).
      source: '/:path((?!badge/).*).(mp4|webm|jpg|jpeg|png|gif|svg|ico|woff|woff2)',
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

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { BRAND_NAME, SITE_URL } from '@/lib/brand';
import { THEME_INIT_SCRIPT } from '@/lib/themeScript';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DEFAULT_TITLE = `${BRAND_NAME}: All your sites. One screen. Free.`;
const DESCRIPTION =
  'Every Google Analytics 4 property and Search Console site you own on one free screen. Build dashboards you can share, show verified traffic on a public leaderboard, and ask ChatGPT or Claude about your numbers.';
const SHORT_DESCRIPTION = 'All your Google Analytics and Search Console sites on one free screen, with dashboards, a verified leaderboard and a ChatGPT/Claude connector.';

export const metadata: Metadata = {
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${BRAND_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: BRAND_NAME,
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.svg',
  },
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: DEFAULT_TITLE,
    description: SHORT_DESCRIPTION,
    siteName: `${BRAND_NAME}`,
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: SHORT_DESCRIPTION,
  },
  manifest: '/manifest.json',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  // Light surfaces by default (public pages are always light); the app in dark mode.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0c0f' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" data-scroll-behavior="smooth" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Theme before first paint (lib/themeScript.ts): the app follows the
            stored Light/Dark/System choice, everything else is light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta name="ory-verify" content="orynth-754970ea155245b89f4e47db77c81f43" />
        {/*
          Chrome / Edge / Safari auto-translate wrap text nodes in a <font> tag,
          which steals them from React's expected parent. When React then runs
          removeChild / insertBefore on what it thinks is its own child, the
          browser throws "NotFoundError: ... not a child of this node" and the
          whole tree unmounts. This is React issue #11538 (open since 2017).

          Patching the two Node prototype methods to no-op on a parent
          mismatch lets translate freely mutate the DOM while React keeps
          rendering. Worst case is a single dropped update on a contested
          node — vastly better than the whole page crashing. Runs synchronously
          during HTML parse, so it is in place before React hydrates.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(typeof Node==='undefined'||!Node.prototype)return;function warn(op){if(typeof console!=='undefined'&&console.warn){console.warn('translate-patch: '+op+' parent mismatch');}}var rc=Node.prototype.removeChild;Node.prototype.removeChild=function(c){if(c&&c.parentNode!==this){warn('removeChild');return c;}return rc.call(this,c);};var ib=Node.prototype.insertBefore;Node.prototype.insertBefore=function(n,b){if(b&&b.parentNode!==this){warn('insertBefore');return n;}return ib.call(this,n,b);};var rp=Node.prototype.replaceChild;Node.prototype.replaceChild=function(n,o){if(o&&o.parentNode!==this){warn('replaceChild');return o;}return rp.call(this,n,o);};})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              '@id': `${SITE_URL}/#organization`,
              name: `${BRAND_NAME}`,
              url: `${SITE_URL}`,
              logo: `${SITE_URL}/icon.svg`,
              description: SHORT_DESCRIPTION,
              contactPoint: {
                '@type': 'ContactPoint',
                email: 'support@trafficclaw.com',
                contactType: 'customer support',
              },
              sameAs: [],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: `${BRAND_NAME}`,
              alternateName: DEFAULT_TITLE,
              url: `${SITE_URL}`,
              description: DESCRIPTION,
              inLanguage: 'en-US',
              publisher: {
                '@id': `${SITE_URL}/#organization`,
              },
            }),
          }}
        />
        {/* Google tag (gtag.js) — deferred to reduce TBT */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-CHVVXR3HD2"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-CHVVXR3HD2');`}
        </Script>
        {/* Microsoft Clarity — deferred to reduce TBT */}
        <Script id="clarity-init" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "w0bverna26");`}
        </Script>
      </head>
      <body
        suppressHydrationWarning
        className="antialiased"
      >
        <a href="#main-content" className="skip-to-content">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

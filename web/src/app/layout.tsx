import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { BRAND_NAME, SITE_URL } from '@/lib/brand';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND_NAME} — AI-Powered SEO & Analytics Platform`,
    template: `%s | ${BRAND_NAME}`,
  },
  description: "AI-powered SEO & analytics platform. Monitor Google Analytics & Search Console, get AI insights, traffic alerts, and automated fixes. Start free.",
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.svg',
  },
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: `${BRAND_NAME} — AI-Powered SEO & Analytics Platform`,
    description: 'Monitor Google Analytics & Search Console, get AI-powered insights, traffic drop alerts, and automated SEO fixes.',
    siteName: `${BRAND_NAME}`,
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: `${BRAND_NAME} — AI-Powered SEO & Analytics Dashboard`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND_NAME} — AI-Powered SEO & Analytics Platform`,
    description: 'Monitor Google Analytics & Search Console, get AI-powered insights, traffic drop alerts, and automated SEO fixes.',
    images: ['/og-image.png'],
  },
  other: {
    'theme-color': '#000000',
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
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
              '@type': 'SoftwareApplication',
              name: `${BRAND_NAME}`,
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              url: `${SITE_URL}`,
              description: 'AI-powered SEO & analytics platform. Monitor Google Analytics & Search Console, get AI insights, traffic alerts, and automated fixes.',
              featureList: 'Real-time Analytics Dashboard, SEO Intelligence, AI Chat Assistant, Site Audit, Telegram Bot, Smart Alerts, AI SEO Tools',
              offers: [
                { '@type': 'Offer', name: 'Growth', price: '19', priceCurrency: 'USD', description: '50 AI credits/month', url: `${SITE_URL}/pricing` },,
                { '@type': 'Offer', name: 'Pro', price: '29', priceCurrency: 'USD', description: '100 AI credits/month + Telegram bot', url: `${SITE_URL}/pricing` },,
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: `${BRAND_NAME}`,
              url: `${SITE_URL}`,
              logo: `${SITE_URL}/icon.svg`,
              description: 'AI-powered SEO & analytics platform for growth teams.',
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
              alternateName: `${BRAND_NAME} — AI-Powered SEO & Analytics Platform`,
              url: `${SITE_URL}`,
              description:
                'AI-powered SEO & analytics platform. Monitor Google Analytics & Search Console, get AI insights, traffic alerts, and automated SEO fixes.',
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black`}
      >
        <a href="#main-content" className="skip-to-content">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

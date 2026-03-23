import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

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
    default: 'TrafficClaw — AI-Powered SEO & Analytics Platform',
    template: '%s | TrafficClaw',
  },
  description: "AI-powered SEO & analytics platform. Monitor Google Analytics & Search Console, get AI insights, traffic alerts, and automated fixes. Start free.",
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.svg',
  },
  metadataBase: new URL('https://trafficclaw.com'),
  openGraph: {
    title: 'TrafficClaw — AI-Powered SEO & Analytics Platform',
    description: 'Monitor Google Analytics & Search Console, get AI-powered insights, traffic drop alerts, and automated SEO fixes.',
    siteName: 'TrafficClaw',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'TrafficClaw — AI-Powered SEO & Analytics Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrafficClaw — AI-Powered SEO & Analytics Platform',
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
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'TrafficClaw',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              url: 'https://trafficclaw.com',
              description: 'AI-powered SEO & analytics platform. Monitor Google Analytics & Search Console, get AI insights, traffic alerts, and automated fixes.',
              featureList: 'Real-time Analytics Dashboard, SEO Intelligence, AI Chat Assistant, Site Audit, Telegram Bot, Smart Alerts, AI SEO Tools',
              offers: [
                { '@type': 'Offer', name: 'Starter', price: '9', priceCurrency: 'USD', description: '50 AI credits/month', url: 'https://trafficclaw.com/pricing' },
                { '@type': 'Offer', name: 'Growth', price: '19', priceCurrency: 'USD', description: '150 AI credits/month', url: 'https://trafficclaw.com/pricing' },
                { '@type': 'Offer', name: 'Pro', price: '29', priceCurrency: 'USD', description: '300 AI credits/month + Telegram bot', url: 'https://trafficclaw.com/pricing' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '127', bestRating: '5', worstRating: '1' },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'TrafficClaw',
              url: 'https://trafficclaw.com',
              logo: 'https://trafficclaw.com/icon.svg',
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
        {/* Google tag (gtag.js) */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-CHVVXR3HD2" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-CHVVXR3HD2');
            `,
          }}
        />
        {/* Microsoft Clarity */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "w0bverna26");
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black`}
      >
        <a href="#main-content" className="skip-to-content">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

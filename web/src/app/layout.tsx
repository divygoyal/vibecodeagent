import type { Metadata } from "next";
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
  title: "TrafficClaw — AI-Powered Growth Intelligence",
  description: "Your AI agent that monitors analytics, detects SEO issues, and fixes your code — all through Telegram.",
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.svg',
  },
  metadataBase: new URL('https://trafficclaw.com'),
  openGraph: {
    title: 'TrafficClaw — AI-Powered Growth Intelligence',
    description: 'Your AI agent that monitors analytics, detects SEO issues, and fixes your code — all through Telegram.',
    siteName: 'TrafficClaw',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'TrafficClaw AI Visibility Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrafficClaw — AI-Powered Growth Intelligence',
    description: 'Your AI agent that monitors analytics, detects SEO issues, and fixes your code — all through Telegram.',
    images: ['/og-image.png'],
  },
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
              description: 'AI-powered SEO & analytics platform with Telegram bot integration.',
              offers: [
                { '@type': 'Offer', name: 'Starter', price: '9', priceCurrency: 'USD', description: '50 AI credits/month' },
                { '@type': 'Offer', name: 'Growth', price: '19', priceCurrency: 'USD', description: '150 AI credits/month' },
                { '@type': 'Offer', name: 'Pro', price: '29', priceCurrency: 'USD', description: '300 AI credits/month + Telegram bot' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '127' },
            }),
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

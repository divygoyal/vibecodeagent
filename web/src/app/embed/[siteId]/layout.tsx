import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TrafficClaw Globe — Real-Time Visitors',
  description: 'Real-time visitor globe powered by TrafficClaw',
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-screen bg-[#080c18] overflow-hidden">
      {children}
    </div>
  );
}

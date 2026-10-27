import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
    const { host } = await params;
    return { title: `Pages · ${decodeURIComponent(host)}` };
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}

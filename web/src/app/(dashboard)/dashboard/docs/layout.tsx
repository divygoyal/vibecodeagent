import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Docs' };

/** Server layout so this client page gets its own document title. */
export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}

import Link from 'next/link';

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <div className="bg-gradient-to-r from-emerald-600 to-cyan-500 text-black text-center py-2.5 text-sm font-medium">
                <Link href="/pricing" className="hover:underline">
                    Sign up for the full SEO platform <span className="font-bold">→</span>
                </Link>
            </div>
            {children}
        </>
    );
}

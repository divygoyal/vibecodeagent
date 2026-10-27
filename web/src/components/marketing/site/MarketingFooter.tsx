import Link from 'next/link';

import { BRAND_NAME } from '@/lib/brand';
import { BrandMark } from './BrandMark';
import { FOOTER_COLUMNS } from './nav';

/** Footer (DESIGN 5.16): logo + one line, four link columns. */
export function MarketingFooter() {
    return (
        <footer className="border-t border-border-subtle bg-surface">
            <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 md:py-16">
                <div className="grid gap-10 grid-cols-1 md:grid-cols-[1.4fr_repeat(4,1fr)]">
                    <div className="max-w-[280px]">
                        <BrandMark />
                        <p className="mt-3 text-body-sm text-fg-muted">
                            All your sites. One screen. Free. Google Analytics 4 and Search Console for every site you own,
                            with read-only access.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 md:col-span-4">
                        {FOOTER_COLUMNS.map((col) => (
                            <div key={col.title}>
                                <h2 className="text-body-sm font-semibold text-fg">{col.title}</h2>
                                <ul className="mt-3 space-y-2 pointer-coarse:mt-1.5 pointer-coarse:space-y-0">
                                    {col.links.map((link) => (
                                        <li key={link.href}>
                                            <Link href={link.href} className="text-body-sm text-fg-muted transition-colors duration-120 hover:text-fg pointer-coarse:inline-flex pointer-coarse:min-h-8 pointer-coarse:items-center">
                                                {link.label}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="mt-12 flex flex-col gap-2 border-t border-border-subtle pt-6 text-meta text-fg-muted sm:flex-row sm:items-center sm:justify-between">
                    <p>© {new Date().getFullYear()} {BRAND_NAME}</p>
                    <p className="sm:max-w-[640px] sm:text-right">
                        Google Analytics and Search Console are trademarks of Google LLC. ChatGPT, Claude and Cursor belong to their
                        owners. {BRAND_NAME} is not affiliated with any of them.
                    </p>
                </div>
            </div>
        </footer>
    );
}

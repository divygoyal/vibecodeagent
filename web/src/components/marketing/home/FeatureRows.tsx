import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, ListChecks, PanelsTopLeft, PanelTop, Sparkles, WandSparkles, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';
import tourImages from './tourImages.json';

export type FeatureKey = 'site' | 'fixes' | 'traffic' | 'dashboards' | 'ask';

/** One feature row. Plain data, built in page.tsx. */
export interface FeatureRow {
    key: FeatureKey;
    label: string;
    title: string;
    bullets: string[];
    /** Deep link into the live demo at this screen. */
    href: string;
    cta: string;
    alt: string;
}

const ICONS: Record<FeatureKey, LucideIcon> = {
    site: PanelTop,
    fixes: ListChecks,
    traffic: Sparkles,
    dashboards: PanelsTopLeft,
    ask: WandSparkles,
};

/**
 * The pictures: crops of the real app taken through the live demo by scripts/dev/marketing-shots.mjs, kept at
 * 2x, with a content hash in each file name (a new picture is a new URL) and their pixel sizes.
 * Desktop crops are the app's content column at 1024 px (~760 css px wide) or, for wide ones, at 1280 px
 * (~1016 css px): each is shown at about its own css width, so the app's text keeps its size.
 */
type Form = { width: number; height: number; light: string; dark: string };
const IMAGES = tourImages as Record<FeatureKey, { desktop: Form; mobile: Form }>;

/** Wide crops get a full-width row; the others sit beside their copy, alternating sides. */
const isWide = (key: FeatureKey) => IMAGES[key].desktop.width / 2 > 900;

function Shot({ row, wide }: { row: FeatureRow; wide: boolean }) {
    const { desktop, mobile } = IMAGES[row.key];
    const dSizes = wide ? '(min-width: 1112px) 1016px, (min-width: 768px) 92vw, 100vw' : '(min-width: 1200px) 736px, (min-width: 1024px) 62vw, (min-width: 768px) 92vw, 100vw';
    return (
        <figure className="min-w-0">
            <div className={cn('hidden overflow-hidden rounded-panel border border-border-subtle bg-canvas shadow-[0_24px_64px_-28px_rgb(0_0_0/0.3)] md:block', wide && 'mx-auto max-w-[1016px]')}>
                <Image src={desktop.light} alt={row.alt} width={desktop.width} height={desktop.height} sizes={dSizes} className="block h-auto w-full dark:hidden" />
                <Image src={desktop.dark} alt={row.alt} width={desktop.width} height={desktop.height} sizes={dSizes} className="hidden h-auto w-full dark:block" />
            </div>
            <div className="mx-auto max-w-[400px] overflow-hidden rounded-card bg-canvas shadow-card ring-1 ring-border-subtle md:hidden">
                <Image src={mobile.light} alt={row.alt} width={mobile.width} height={mobile.height} sizes="(max-width: 432px) 92vw, 400px" className="block h-auto w-full dark:hidden" />
                <Image src={mobile.dark} alt={row.alt} width={mobile.width} height={mobile.height} sizes="(max-width: 432px) 92vw, 400px" className="hidden h-auto w-full dark:block" />
            </div>
        </figure>
    );
}

function Copy({ row }: { row: FeatureRow }) {
    const Icon = ICONS[row.key];
    return (
        <div className="min-w-0">
            <p className="flex items-center gap-2 text-body-sm font-medium text-brand-text">
                <Icon aria-hidden size={16} strokeWidth={1.75} />
                {row.label}
            </p>
            <h3 className="mt-2 text-balance text-heading text-fg md:text-heading-lg">{row.title}</h3>
            <ul className="mt-4 space-y-2">
                {row.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-body-lg text-fg-secondary">
                        <Check aria-hidden size={18} strokeWidth={2.5} className="mt-0.5 shrink-0 text-brand-text" />
                        {b}
                    </li>
                ))}
            </ul>
            <Link href={row.href} className="tap-area mt-5 inline-flex items-center gap-1.5 text-body font-medium text-brand-text hover:text-fg">
                {row.cta}
                <ArrowRight aria-hidden size={16} strokeWidth={1.75} />
            </Link>
        </div>
    );
}

/**
 * Every feature visible while scrolling (no tabs): one row each, a large crop of the real app beside (or, for
 * wide crops, under) a short headline, three bullets and a link to that screen in the live demo. Desktop
 * pictures from 768 px, the phone layout below; light or dark with the page; lazy below the fold.
 * Each row is an anchor (`#tour-<key>`) for links from the footer and other pages.
 */
export function FeatureRows({ rows }: { rows: FeatureRow[] }) {
    let split = 0;
    return (
        <div className="flex flex-col gap-16 md:gap-24">
            {rows.map((row) => {
                const wide = isWide(row.key);
                if (wide) {
                    return (
                        <section key={row.key} id={`tour-${row.key}`} aria-label={row.label} className="scroll-mt-24">
                            <div className="mx-auto max-w-[1016px]">
                                <Copy row={row} />
                            </div>
                            <div className="mt-8">
                                <Shot row={row} wide />
                            </div>
                        </section>
                    );
                }
                const imageLeft = split++ % 2 === 1;
                return (
                    <section
                        key={row.key}
                        id={`tour-${row.key}`}
                        aria-label={row.label}
                        className={cn(
                            'grid scroll-mt-24 grid-cols-1 items-center gap-8 lg:gap-12',
                            imageLeft ? 'lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]' : 'lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]',
                        )}
                    >
                        <div className={cn(imageLeft && 'lg:order-2')}><Copy row={row} /></div>
                        <div className={cn(imageLeft && 'lg:order-1')}><Shot row={row} wide={false} /></div>
                    </section>
                );
            })}
            <p className="text-center text-meta text-fg-muted">Real app screens · sample data</p>
        </div>
    );
}

import Link from 'next/link';
import { ArrowRight, Check, ListChecks, PanelsTopLeft, PanelTop, Sparkles, type LucideIcon } from 'lucide-react';

import type { HomeLive } from './homeLive';
import { LiveRow } from './live/LiveRow';
import tourImages from './tourImages.json';

export type FeatureKey = 'site' | 'fixes' | 'traffic' | 'dashboards';

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
};

/**
 * The pictures: crops of the real app taken through the live demo by scripts/dev/marketing-shots.mjs. Each comes
 * as a 2x capture and a 1x copy (content-hashed names); `width`/`height` are the crop's css pixels. Desktop crops
 * are the app's content column at 1280 px (1016 css px wide) and are shown at most that wide, so the app's own
 * text keeps its size (≥12 px at 1024 and 1440); phones get the 390 px layout (382 css px).
 */
type Pair = { x1: string; x2: string };
type Form = { width: number; height: number; light: Pair; dark: Pair };
const IMAGES = tourImages as Record<FeatureKey, { desktop: Form; mobile: Form }>;

/**
 * A crop as a plain <img> with a 1x/2x srcset: every screen gets exactly the captured pixels (no optimizer
 * re-encode, no upscaling). Lazy, so only the variant on screen (form and theme) is ever fetched.
 */
function Img({ pair, form, alt, sizes, className }: { pair: Pair; form: Form; alt: string; sizes: string; className: string }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element -- pre-sized 1x/2x WebP pair; next/image would re-encode it softer
        <img
            src={pair.x1}
            srcSet={`${pair.x1} ${form.width}w, ${pair.x2} ${form.width * 2}w`}
            sizes={sizes}
            width={form.width}
            height={form.height}
            alt={alt}
            loading="lazy"
            decoding="async"
            className={className}
        />
    );
}

function Shot({ row }: { row: FeatureRow }) {
    const { desktop, mobile } = IMAGES[row.key];
    const dSizes = `(min-width: 1064px) ${desktop.width}px, 92vw`;
    const mSizes = `(max-width: 432px) 92vw, ${mobile.width}px`;
    // The crop already carries the app's own page colour and card borders: a hairline frame, no halo in dark.
    return (
        <figure className="min-w-0">
            <div className="hidden overflow-hidden rounded-panel border border-border-subtle bg-canvas shadow-[0_20px_48px_-28px_rgb(0_0_0/0.28)] md:block dark:shadow-none">
                <Img pair={desktop.light} form={desktop} alt={row.alt} sizes={dSizes} className="block h-auto w-full dark:hidden" />
                <Img pair={desktop.dark} form={desktop} alt={row.alt} sizes={dSizes} className="hidden h-auto w-full dark:block" />
            </div>
            <div className="mx-auto max-w-[400px] overflow-hidden rounded-card border border-border-subtle bg-canvas md:hidden">
                <Img pair={mobile.light} form={mobile} alt={row.alt} sizes={mSizes} className="block h-auto w-full dark:hidden" />
                <Img pair={mobile.dark} form={mobile} alt={row.alt} sizes={mSizes} className="hidden h-auto w-full dark:block" />
            </div>
        </figure>
    );
}

/**
 * Every feature visible while scrolling, all rows alike: the copy (label, ≤8-word headline, three bullets, a
 * link to that screen in the live demo) in one band above the product. Each row is an anchor (`#tour-<key>`) for
 * links from the footer and other pages.
 *
 * Round 6: the product is live. Each row with sample data in `live` becomes the app's real components (clickable,
 * nothing saved) once it scrolls near the screen; until then, and for any row without data, it is the static crop.
 */
function Product({ row, live }: { row: FeatureRow; live?: HomeLive }) {
    const shot = <Shot row={row} />;
    switch (row.key) {
        case 'site': return live?.site ? <LiveRow kind="site" data={live.site}>{shot}</LiveRow> : shot;
        case 'traffic': return live?.traffic ? <LiveRow kind="traffic" data={live.traffic}>{shot}</LiveRow> : shot;
        case 'fixes': return live?.fixes ? <LiveRow kind="fixes" data={live.fixes}>{shot}</LiveRow> : shot;
        case 'dashboards': return live?.dashboards ? <LiveRow kind="dashboards" data={live.dashboards}>{shot}</LiveRow> : shot;
        default: return shot;
    }
}

export function FeatureRows({ rows, live }: { rows: FeatureRow[]; live?: HomeLive }) {
    return (
        <div className="mx-auto flex max-w-[1016px] flex-col gap-16 md:gap-24">
            {rows.map((row) => {
                const Icon = ICONS[row.key];
                return (
                    <section key={row.key} id={`tour-${row.key}`} aria-label={row.label} className="scroll-mt-24">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-10">
                            <div className="min-w-0">
                                <p className="flex items-center gap-2 text-body-sm font-medium text-brand-text">
                                    <Icon aria-hidden size={16} strokeWidth={1.75} />
                                    {row.label}
                                </p>
                                <h3 className="mt-2 text-balance text-heading text-fg md:text-heading-lg">{row.title}</h3>
                                <ul className="mt-3 flex flex-col gap-x-6 gap-y-1.5 md:flex-row md:flex-wrap">
                                    {row.bullets.map((b) => (
                                        <li key={b} className="flex items-center gap-2 text-body text-fg-secondary">
                                            <Check aria-hidden size={16} strokeWidth={2.5} className="shrink-0 text-brand-text" />
                                            {b}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <Link href={row.href} className="tap-area inline-flex shrink-0 items-center gap-1.5 self-start text-body font-medium text-brand-text hover:text-fg md:self-auto md:pb-0.5">
                                {row.cta}
                                <ArrowRight aria-hidden size={16} strokeWidth={1.75} />
                            </Link>
                        </div>
                        <div className="mt-6">
                            <Product row={row} live={live} />
                        </div>
                    </section>
                );
            })}
            <p className="text-center text-meta text-fg-secondary">Real app screens · sample data · nothing you click here is saved</p>
        </div>
    );
}

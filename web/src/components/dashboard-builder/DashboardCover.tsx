'use client';

/**
 * Cover page for client reports (round 2 white-label kit). Shown above the first page when
 * theme.cover.enabled; the PDF export puts it on its own first page. Left, centred or split
 * layout; logo (a dark-background logo when the dashboard renders dark), prepared for / by,
 * title and subtitle with {{name}}, {{site}} and {{date_range}}, a contents list for reports
 * with three or more pages, and optionally the first KPI strip.
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { PageDef, ThemeV2 } from '@/lib/builder/types';

export function fillCoverVars(text: string | undefined, vars: Record<string, string>): string {
    return (text ?? '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k: string) => vars[k] ?? m);
}

export function DashboardCover({ theme, name, vars, pages, currentPageId, onPage, kpis, dark }: {
    theme: ThemeV2;
    name: string;
    vars: Record<string, string>;
    pages: PageDef[];
    currentPageId?: string;
    onPage?: (id: string) => void;
    kpis?: ReactNode;
    dark?: boolean;
}) {
    const c = theme.cover;
    if (!c?.enabled) return null;
    const all = { ...vars, name };
    const title = fillCoverVars(c.title || '{{name}}', all);
    const subtitle = fillCoverVars(c.subtitle ?? '', all);
    const brand = theme.brand ?? {};
    const logo = (dark && brand.logoDarkUrl) || theme.header.logoUrl;
    const safeLogo = logo && /^https:\/\//i.test(logo) ? logo : null;
    const image = c.imageUrl && /^https:\/\//i.test(c.imageUrl) ? c.imageUrl : null;
    const company = theme.header.companyName;
    const toc = pages.length >= 3;
    const center = c.layout === 'center';

    const text = (
        <div className={cn('relative flex min-w-0 flex-col gap-4', center && 'items-center text-center')}>
            {safeLogo || company ? (
                <div className={cn('flex items-center gap-3', center && 'justify-center')}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {safeLogo ? <img src={safeLogo} alt={company ? `${company} logo` : 'Logo'} referrerPolicy="no-referrer" className="h-10 max-w-[200px] object-contain" /> : null}
                    {company ? <span className="text-title-sm text-fg">{company}</span> : null}
                </div>
            ) : null}
            {brand.preparedFor ? <p className="text-caption font-semibold uppercase tracking-[0.08em] text-brand-text">Prepared for {brand.preparedFor}</p> : null}
            <div className="space-y-2">
                <h2 data-dash-cover-title="" className="text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.02em] text-fg [overflow-wrap:anywhere] sm:text-[2rem] md:text-[2.5rem]">{title}</h2>
                {subtitle ? <p className="text-title font-normal text-fg-secondary">{subtitle}</p> : null}
            </div>
            {brand.preparedBy ? <p className="text-body-sm text-fg-muted">Prepared by <span className="font-medium text-fg-secondary">{brand.preparedBy}</span></p> : null}
            {toc ? (
                <nav aria-label="Contents" className={cn('mt-2 w-full max-w-[560px]', center && 'mx-auto')}>
                    <p className="mb-2 text-caption font-semibold uppercase tracking-[0.08em] text-fg-muted">Contents</p>
                    <ol className="grid gap-x-6 gap-y-1 text-left sm:grid-cols-2">
                        {pages.map((p, i) => (
                            <li key={p.id}>
                                <button type="button" onClick={onPage ? () => onPage(p.id) : undefined} disabled={!onPage}
                                    className={cn('tap-area flex w-full items-baseline gap-2 rounded-md py-1 text-body-sm', onPage && 'hover:text-fg', p.id === currentPageId ? 'text-fg' : 'text-fg-secondary')}>
                                    <span className="w-5 shrink-0 tabular-nums text-fg-muted">{String(i + 1).padStart(2, '0')}</span>
                                    <span className="min-w-0 truncate">{p.title}</span>
                                </button>
                            </li>
                        ))}
                    </ol>
                </nav>
            ) : null}
        </div>
    );

    return (
        <section data-dash-cover="" aria-label="Cover" className={cn('relative overflow-hidden rounded-card border border-border-subtle bg-surface shadow-card', c.layout === 'split' ? 'grid md:grid-cols-[1.25fr_1fr]' : '')}>
            {c.layout === 'left' || !c.layout ? <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-brand" /> : null}
            {center ? <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-brand" /> : null}
            <div className={cn('px-6 py-8 sm:px-10 sm:py-12', c.layout === 'left' && 'pl-8 sm:pl-12')}>
                {text}
                {kpis ? <div className="mt-6 flex min-h-[120px] flex-col text-left [&>*]:flex-1">{kpis}</div> : null}
            </div>
            {c.layout === 'split' ? (
                <div className="relative min-h-[180px] bg-brand">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {image ? <img src={image} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" /> : (
                        <div aria-hidden className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, var(--tc-brand-fg) 0, transparent 45%), radial-gradient(circle at 80% 75%, var(--tc-brand-fg) 0, transparent 35%)' }} />
                    )}
                </div>
            ) : null}
        </section>
    );
}

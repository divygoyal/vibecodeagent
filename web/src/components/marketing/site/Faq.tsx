import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';

export interface FaqItem {
    q: string;
    /** Plain text, also used for the FAQPage JSON-LD. */
    a: string;
    /** Optional richer answer (links); falls back to `a`. */
    body?: ReactNode;
}

/** Accordion built on <details> (works without JS, keyboard and screen-reader friendly). */
export function Faq({ items, className }: { items: FaqItem[]; className?: string }) {
    return (
        <div className={className}>
            <div className="divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface shadow-card">
                {items.map((item) => (
                    <details key={item.q} className="group">
                        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-card px-5 py-4 text-body-lg font-medium text-fg [&::-webkit-details-marker]:hidden">
                            {item.q}
                            <Plus aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-fg-muted transition-transform duration-180 group-open:rotate-45" />
                        </summary>
                        <div className="-mt-1 px-5 pb-5 text-body-lg text-fg-secondary">{item.body ?? item.a}</div>
                    </details>
                ))}
            </div>
            <FaqJsonLd items={items} />
        </div>
    );
}

export function FaqJsonLd({ items }: { items: FaqItem[] }) {
    const data = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
    };
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

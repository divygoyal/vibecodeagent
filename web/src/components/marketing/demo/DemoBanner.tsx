import { FlaskConical } from 'lucide-react';

import { ConnectGoogleButton } from '../site/ConnectGoogleButton';

/**
 * Neutral page banner (DESIGN 5.21): this is sample data, connect your own sites.
 * Round 2: it sticks under the header so the way out of the demo stays in view
 * (teardown-b #21), and it stays one line on phones.
 */
export function DemoBanner({ sites }: { sites?: number }) {
    return (
        <div className="sticky top-16 z-20 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2 shadow-xs sm:px-3.5 sm:py-2.5">
            <div className="flex items-center gap-3">
                <FlaskConical aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
                <p className="min-w-0 flex-1 text-body-sm text-fg-secondary">
                    <span className="font-medium text-fg">Live demo</span>
                    <span className="sm:hidden"> · sample data</span>
                    <span className="hidden sm:inline">
                        {' '}with {sites ? `${sites} ` : ''}made-up <code className="font-mono text-[0.95em]">.example</code> sites. Every number is
                        generated sample data; nothing here is read from Google.
                    </span>
                </p>
                <ConnectGoogleButton size="sm" label="Connect your sites" className="shrink-0" />
            </div>
        </div>
    );
}

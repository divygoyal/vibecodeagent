import { FlaskConical } from 'lucide-react';

import { ConnectGoogleButton } from '../site/ConnectGoogleButton';

/** Neutral page banner (DESIGN 5.21): this is sample data, connect your own sites. */
export function DemoBanner() {
    return (
        <div className="flex flex-col gap-3 rounded-control border border-border-subtle bg-surface-sunken p-3.5 sm:flex-row sm:items-center">
            <FlaskConical aria-hidden size={16} strokeWidth={1.75} className="hidden shrink-0 text-fg-muted sm:block" />
            <p className="flex-1 text-body-sm text-fg-secondary">
                <span className="font-medium text-fg">Live demo with sample sites.</span>{' '}
                Every number here is generated sample data for made-up <code className="font-mono text-[0.95em]">.example</code> sites. Nothing is read from Google.
            </p>
            <ConnectGoogleButton size="sm" label="Connect your own sites" className="self-start sm:self-auto" />
        </div>
    );
}

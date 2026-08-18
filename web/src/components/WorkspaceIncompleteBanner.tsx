'use client';

/**
 * Sticky banner shown on every dashboard page when the user has marked
 * workspace setup as completed but hasn't picked any data sources yet
 * ("Skip for now" path). Per-route inline banners (SEO needs GSC, AI
 * chat needs GA4, etc.) still fire — this is the global reminder.
 */
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useWorkspace } from '@/app/(dashboard)/dashboard/layout';

export default function WorkspaceIncompleteBanner() {
    const { selectedSite, selectedProperty, isDemoWorkspace, isWorkspaceLoaded } = useWorkspace();

    // Only show when we know the workspace is empty AND not in demo mode.
    if (!isWorkspaceLoaded) return null;
    if (isDemoWorkspace) return null;
    if (selectedSite || selectedProperty) return null;

    return (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 text-[12.5px] text-amber-100/90 leading-relaxed">
                <span className="font-semibold text-amber-200">Your workspace is missing data sources.</span>{' '}
                Add a Search Console site or GA4 property to unlock everything.
            </div>
            <Link
                href="/dashboard/setup"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 hover:text-amber-50 text-[11px] font-semibold transition-colors flex-shrink-0"
            >
                Complete setup
                <ArrowRight className="w-3 h-3" />
            </Link>
        </div>
    );
}

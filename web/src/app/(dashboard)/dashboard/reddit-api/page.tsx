'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    ArrowRight,
    Check,
    Copy,
    ExternalLink,
    Globe2,
    Link2,
    Loader2,
    MessageCircle,
    RefreshCcw,
    Sparkles,
    Trash2,
} from 'lucide-react';

import DashboardHoverSurface from '@/components/dashboard/DashboardHoverSurface';
import RedditMentionsLockup from '@/components/social/RedditMentionsMark';
import { RedditWidgetSurface } from '@/components/social/RedditWebsiteEmbed';
import {
    buildRedditEmbedCode,
    DEFAULT_X_WIDGET_CONFIG,
    normalizeXWidgetConfig,
    type SocialEmbedTokenRecord,
} from '@/lib/socialEmbeds';
import { type RedditMentionPayload } from '@/lib/redditMentionsShared';
import { canonicalizeDomainInput } from '@/lib/xMentionsShared';

type MentionFetchResult = {
    canonicalDomain: string;
    mentions: RedditMentionPayload[];
    warning?: string;
    error?: string;
};

type DemoState = {
    status: 'loading' | 'ready' | 'error';
    mentions: RedditMentionPayload[];
    warning?: string;
    error?: string;
};

const STEP_ITEMS = [
    'Enter your website domain',
    'Get embed code',
    'Apply in your website',
] as const;

function formatCreatedAt(value: string | null) {
    if (!value) return 'Just now';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Just now';

    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function CopyButton({
    label,
    copied,
    onClick,
    disabled = false,
}: {
    label: string;
    copied: boolean;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-zinc-300 transition hover:border-orange-400/30 hover:bg-orange-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : label}
        </button>
    );
}

function CodeBlock({ code }: { code: string }) {
    return (
        <pre className="overflow-x-auto rounded-[12px] border border-white/[0.08] bg-[#0a0f14] px-4 py-4 text-[12px] leading-6 text-zinc-300">
            <code>{code}</code>
        </pre>
    );
}

export default function RedditApiPage() {
    const router = useRouter();
    const pathname = usePathname();
    const hydratedDomainRef = useRef<string | null>(null);
    const [appOrigin, setAppOrigin] = useState('https://trafficclaw.com');
    const [domainInput, setDomainInput] = useState('');
    const [demoState, setDemoState] = useState<DemoState>({ status: 'loading', mentions: [] });
    const [latestPreview, setLatestPreview] = useState<MentionFetchResult | null>(null);
    const [tokens, setTokens] = useState<SocialEmbedTokenRecord[]>([]);
    const [currentWidget, setCurrentWidget] = useState<SocialEmbedTokenRecord | null>(null);
    const [loadingTokens, setLoadingTokens] = useState(true);
    const [refreshingTokens, setRefreshingTokens] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [revokingToken, setRevokingToken] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setAppOrigin(window.location.origin);
        }
    }, []);

    const copyValue = useCallback(async (value: string, id: string) => {
        await navigator.clipboard.writeText(value);
        setCopiedId(id);
        window.setTimeout(() => {
            setCopiedId((current) => (current === id ? null : current));
        }, 1800);
    }, []);

    const fetchMentions = useCallback(async (domain: string): Promise<MentionFetchResult> => {
        const response = await fetch('/api/reddit-mentions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain }),
        });

        const payload = await response.json().catch(() => ({}));
        const canonicalDomain =
            canonicalizeDomainInput(payload.canonicalDomain || domain) ||
            canonicalizeDomainInput(domain);
        const mentions = Array.isArray(payload.mentions) ? payload.mentions : [];
        const warning = typeof payload.warning === 'string' ? payload.warning : undefined;
        const error = typeof payload.error === 'string' ? payload.error : undefined;

        if (!canonicalDomain) {
            throw new Error(error || warning || 'Enter a valid domain like example.com.');
        }

        if (!response.ok && mentions.length === 0) {
            throw new Error(error || 'Failed to load Reddit mentions right now.');
        }

        return { canonicalDomain, mentions, warning, error };
    }, []);

    const loadTokens = useCallback(async (background = false) => {
        if (background) {
            setRefreshingTokens(true);
        } else {
            setLoadingTokens(true);
        }

        try {
            const response = await fetch('/api/social-embeds/tokens?platform=reddit', { cache: 'no-store' });
            const data = await response.json().catch(() => []);

            if (response.ok && Array.isArray(data)) {
                const nextTokens = data.map((token) => ({
                    ...token,
                    config: normalizeXWidgetConfig(token.config),
                })) as SocialEmbedTokenRecord[];

                setTokens(nextTokens);
                setCurrentWidget((current) => {
                    if (!current) return current;
                    return nextTokens.find((token) => token.token === current.token) || current;
                });
            }
        } finally {
            if (background) {
                setRefreshingTokens(false);
            } else {
                setLoadingTokens(false);
            }
        }
    }, []);

    useEffect(() => {
        void loadTokens();
    }, [loadTokens]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const nextParams = new URLSearchParams(window.location.search);
        const carriedDomain = canonicalizeDomainInput(nextParams.get('domain') || '');
        if (!carriedDomain || hydratedDomainRef.current === carriedDomain) {
            return;
        }

        hydratedDomainRef.current = carriedDomain;
        setCurrentWidget(null);
        setLatestPreview(null);
        setDomainInput(carriedDomain);
        setFormError(null);
        setNotice(`Carried ${carriedDomain} from your public preview. Generate a new widget to get its embed code.`);

        nextParams.delete('domain');
        const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
        router.replace(nextUrl, { scroll: false });
    }, [pathname, router]);

    useEffect(() => {
        let cancelled = false;

        const loadDemo = async () => {
            setDemoState({ status: 'loading', mentions: [] });

            try {
                const result = await fetchMentions('trafficclaw.com');
                if (cancelled) return;

                setDemoState({
                    status: 'ready',
                    mentions: result.mentions,
                    warning: result.warning,
                });
            } catch (error) {
                if (cancelled) return;

                setDemoState({
                    status: 'error',
                    mentions: [],
                    error: error instanceof Error ? error.message : 'Preview is unavailable right now.',
                });
            }
        };

        void loadDemo();
        return () => {
            cancelled = true;
        };
    }, [fetchMentions]);

    const resolvedDomain = useMemo(() => canonicalizeDomainInput(domainInput) || '', [domainInput]);
    const embedUrl = currentWidget ? `${appOrigin}/embed/reddit/${currentWidget.token}` : null;
    const embedCode = currentWidget ? buildRedditEmbedCode({ token: currentWidget.token, origin: appOrigin }) : '';
    const previewDomain = latestPreview?.canonicalDomain || 'trafficclaw.com';
    const previewMentions = latestPreview?.mentions || demoState.mentions;
    const previewWarning = latestPreview?.warning || (!latestPreview ? demoState.warning : undefined);
    const previewError = latestPreview?.error || (!latestPreview && demoState.status === 'error' ? demoState.error : undefined);
    const previewLoading = !latestPreview && demoState.status === 'loading';
    const isShowingUserPreview = Boolean(latestPreview);
    const hasPendingChanges = Boolean(
        currentWidget &&
        resolvedDomain &&
        resolvedDomain !== currentWidget.domain
    );

    const saveWidget = useCallback(async (preview: MentionFetchResult) => {
        const payload = {
            platform: 'reddit',
            domain: preview.canonicalDomain,
            label: `${preview.canonicalDomain} Reddit mentions`,
            config: DEFAULT_X_WIDGET_CONFIG,
        };

        const runSaveRequest = async (method: 'POST' | 'PATCH') => {
            const response = await fetch('/api/social-embeds/tokens', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(
                    method === 'PATCH' && currentWidget
                        ? { token: currentWidget.token, ...payload }
                        : payload
                ),
            });
            const data = await response.json().catch(() => ({}));
            return { response, data };
        };

        let usedFallbackCreate = false;
        const { response: firstResponse, data: firstData } = await runSaveRequest(currentWidget ? 'PATCH' : 'POST');

        let response = firstResponse;
        let data = firstData;

        if (
            currentWidget &&
            response.status === 405
        ) {
            usedFallbackCreate = true;
            const fallbackResult = await runSaveRequest('POST');
            response = fallbackResult.response;
            data = fallbackResult.data;
        }

        if (!response.ok) {
            throw new Error(
                data.error ||
                (response.status === 405
                    ? 'Your local admin backend does not support widget updates yet. Restart admin-api or click Start a new widget.'
                    : 'Failed to save your Reddit widget.')
            );
        }

        return {
            ...data,
            fallbackCreated: usedFallbackCreate,
            config: normalizeXWidgetConfig(data.config),
        } as SocialEmbedTokenRecord & { fallbackCreated?: boolean };
    }, [currentWidget]);

    const handleGenerate = useCallback(async () => {
        const canonicalDomain = canonicalizeDomainInput(domainInput);
        if (!canonicalDomain) {
            setFormError('Enter a valid domain like example.com.');
            return;
        }

        setSubmitting(true);
        setFormError(null);
        setNotice(null);

        try {
            const preview = await fetchMentions(canonicalDomain);
            const savedWidget = await saveWidget(preview);

            setCurrentWidget(savedWidget);
            setLatestPreview(preview);
            setDomainInput(savedWidget.domain);
            setTokens((current) => {
                const withoutCurrent = current.filter((token) => token.token !== savedWidget.token);
                return [savedWidget, ...withoutCurrent];
            });
            setNotice(
                savedWidget.fallbackCreated
                    ? `Created a new widget for ${savedWidget.domain} because your local admin backend does not support in-place updates yet.`
                    : currentWidget
                    ? `Updated your widget for ${savedWidget.domain}.`
                    : `Your widget for ${savedWidget.domain} is ready.`
            );

            void loadTokens(true);
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'Failed to create your widget.');
        } finally {
            setSubmitting(false);
        }
    }, [currentWidget, domainInput, fetchMentions, loadTokens, saveWidget]);

    const handleLoadWidget = useCallback(async (token: SocialEmbedTokenRecord) => {
        setSubmitting(true);
        setFormError(null);
        setNotice(`Loaded ${token.domain}.`);

        try {
            const preview = await fetchMentions(token.domain);

            setCurrentWidget(token);
            setLatestPreview(preview);
            setDomainInput(token.domain);
        } catch (error) {
            setCurrentWidget(token);
            setLatestPreview(null);
            setDomainInput(token.domain);
            setFormError(
                error instanceof Error
                    ? `Loaded ${token.domain}, but its latest preview could not be fetched: ${error.message}`
                    : `Loaded ${token.domain}, but its latest preview could not be fetched.`
            );
        } finally {
            setSubmitting(false);
        }
    }, [fetchMentions]);

    const handleStartNew = useCallback(() => {
        setCurrentWidget(null);
        setLatestPreview(null);
        setDomainInput('');
        setFormError(null);
        setNotice('You are creating a new widget now.');
    }, []);

    const handleRevoke = useCallback(async (token: string) => {
        setRevokingToken(token);
        setFormError(null);

        try {
            const response = await fetch(`/api/social-embeds/tokens?token=${encodeURIComponent(token)}`, {
                method: 'DELETE',
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'Failed to revoke this widget.');
            }

            setTokens((current) => current.filter((item) => item.token !== token));
            setCurrentWidget((current) => (current?.token === token ? null : current));
            setLatestPreview((current) => {
                if (!currentWidget || currentWidget.token !== token) return current;
                return null;
            });
            setNotice('Widget revoked.');
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'Failed to revoke this widget.');
        } finally {
            setRevokingToken(null);
        }
    }, [currentWidget]);

    return (
        <div className="space-y-6 pb-12">
            <DashboardHoverSurface
                as="section"
                tone="amber"
                className="overflow-hidden border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.1),transparent_30%),linear-gradient(180deg,#0b1016_0%,#080c12_100%)] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.18)] sm:p-8 lg:p-9"
            >
                <div className="max-w-5xl space-y-6">
                    <RedditMentionsLockup
                        iconClassName="h-10 w-10 text-orange-400"
                        textClassName="text-sm font-semibold uppercase tracking-[0.24em] text-white"
                    />

                    <div className="space-y-3">
                        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                            Embed your Reddit mentions in your website
                        </h1>

                        <div className="flex flex-wrap items-center gap-3">
                            {STEP_ITEMS.map((step, index) => (
                                <div key={step} className="flex items-center gap-3">
                                    <div className="dashboard-hover-chip inline-flex items-center gap-2 rounded-[12px] border border-white/[0.08] bg-[#05090d] px-3.5 py-2.5 text-sm text-zinc-300" data-tone="amber">
                                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-[8px] border border-orange-400/20 bg-orange-500/10 text-xs font-semibold text-orange-200">
                                            {index + 1}
                                        </span>
                                        {step}
                                    </div>
                                    {index < STEP_ITEMS.length - 1 ? <ArrowRight className="h-4 w-4 text-zinc-700" /> : null}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border border-white/[0.08] bg-[#0a0f14]/92 p-5 shadow-[0_14px_36px_rgba(0,0,0,0.18)] sm:p-6">
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-white" htmlFor="reddit-domain-input">
                                    Website domain
                                </label>
                                <div className="dashboard-hover-item flex items-center gap-3 rounded-[12px] border border-white/[0.08] bg-[#05080d] px-4 py-4">
                                    <Globe2 className="h-5 w-5 text-orange-300" />
                                    <input
                                        id="reddit-domain-input"
                                        value={domainInput}
                                        onChange={(event) => setDomainInput(event.target.value)}
                                        placeholder="example.com"
                                        className="x-api-domain-input w-full bg-transparent text-lg text-white outline-none placeholder:text-zinc-500"
                                    />
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => void handleGenerate()}
                                disabled={submitting}
                                data-variant="primary"
                                className="dashboard-hover-action inline-flex min-h-[58px] items-center justify-center gap-2 rounded-[12px] border border-orange-400/20 bg-[linear-gradient(135deg,rgba(249,115,22,0.96),rgba(245,158,11,0.9))] px-6 py-4 text-base font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                                {submitting ? 'Generating...' : 'Get My Embed Code'}
                            </button>
                        </div>

                        {resolvedDomain ? (
                            <div className="dashboard-hover-chip mt-5 inline-flex items-center gap-2 rounded-[10px] border border-orange-400/15 bg-orange-500/[0.08] px-3 py-1.5 text-sm text-orange-100" data-tone="amber">
                                Ready for <span className="font-semibold">{resolvedDomain}</span>
                            </div>
                        ) : null}

                        {currentWidget ? (
                            <div className="dashboard-hover-item mt-5 flex flex-wrap items-center gap-3 rounded-[12px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
                                <span>
                                    Editing saved widget for <span className="font-semibold text-white">{currentWidget.domain}</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={handleStartNew}
                                    className="text-orange-300 transition hover:text-orange-200"
                                >
                                    Start a new widget
                                </button>
                            </div>
                        ) : null}

                        {hasPendingChanges ? (
                            <div className="dashboard-hover-item mt-5 rounded-[12px] border border-orange-400/20 bg-orange-500/[0.08] px-4 py-3 text-sm text-orange-100">
                                Preview updates immediately here. Click <span className="font-semibold">Get My Embed Code</span> to save the latest domain to your hosted widget.
                            </div>
                        ) : null}

                        {formError ? (
                            <div className="dashboard-hover-item mt-5 rounded-[12px] border border-red-400/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200">
                                {formError}
                            </div>
                        ) : null}

                        {notice ? (
                            <div className="dashboard-hover-item mt-5 rounded-[12px] border border-emerald-400/15 bg-emerald-500/[0.08] px-4 py-3 text-sm text-emerald-200">
                                {notice}
                            </div>
                        ) : null}
                    </div>
                </div>
            </DashboardHoverSurface>

            <DashboardHoverSurface
                as="section"
                tone="amber"
                className="border border-white/[0.08] bg-[#0c1117] p-5 shadow-[0_14px_40px_rgba(0,0,0,0.16)] sm:p-6"
            >
                <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">
                        <MessageCircle className="h-3.5 w-3.5" />
                        Preview
                    </div>
                    <h2 className="text-2xl font-semibold text-white">
                        {isShowingUserPreview ? previewDomain : 'trafficclaw.com'}
                    </h2>
                    <p className="text-sm leading-7 text-zinc-400">
                        {isShowingUserPreview
                            ? `Showing the latest Reddit posts we found for ${previewDomain}.`
                            : 'Showing the latest Reddit posts from trafficclaw.com until you generate your own widget.'}
                    </p>
                </div>

                <div className="mt-5">
                    <RedditWidgetSurface
                        mode="builder"
                        loading={previewLoading}
                        data={{
                            domain: previewDomain,
                            mentions: previewMentions,
                            config: DEFAULT_X_WIDGET_CONFIG,
                            warning: previewWarning,
                            error: previewError,
                            showBranding: true,
                        }}
                    />
                </div>

                {currentWidget ? (
                    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                        <div className="dashboard-hover-item border border-white/[0.08] bg-[#091018] p-4 sm:p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">
                                        <Link2 className="h-3.5 w-3.5" />
                                        Get Your Code
                                    </div>
                                    <div className="mt-2 text-sm text-zinc-400">
                                        Paste this on your website to show the live Reddit posts widget for <span className="font-semibold text-zinc-200">{currentWidget.domain}</span>.
                                    </div>
                                </div>
                                <CopyButton
                                    label="Copy Code"
                                    copied={copiedId === 'embed-code'}
                                    onClick={() => void copyValue(embedCode, 'embed-code')}
                                />
                            </div>

                            <div className="mt-4">
                                <CodeBlock code={embedCode} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="dashboard-hover-item border border-white/[0.08] bg-[#091018] p-4 sm:p-5">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-medium text-white">Hosted URL</div>
                                        <div className="mt-1 text-sm text-zinc-500">Use the hosted widget URL directly if you prefer your own iframe setup.</div>
                                    </div>
                                    <CopyButton
                                        label="Copy URL"
                                        copied={copiedId === 'embed-url'}
                                        onClick={() => embedUrl && void copyValue(embedUrl, 'embed-url')}
                                        disabled={!embedUrl}
                                    />
                                </div>

                                <div className="mt-4 rounded-[12px] border border-white/[0.08] bg-[#0a0f14] px-4 py-4 text-sm text-zinc-300">
                                    <div className="break-all">{embedUrl}</div>
                                </div>
                            </div>

                            <div className="dashboard-hover-item border border-orange-400/15 bg-[linear-gradient(180deg,rgba(249,115,22,0.12),rgba(9,16,24,0.96))] p-4 sm:p-5">
                                <div className="text-sm font-medium text-white">Done</div>
                                <p className="mt-2 text-sm leading-6 text-zinc-200">
                                    TrafficClaw keeps the same hosted widget URL active and refreshes the Reddit mentions daily behind the scenes.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : null}
            </DashboardHoverSurface>

            <DashboardHoverSurface
                as="section"
                tone="amber"
                className="border border-white/[0.08] bg-[#0c1117] p-5 shadow-[0_14px_40px_rgba(0,0,0,0.16)] sm:p-6"
            >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            <Link2 className="h-3.5 w-3.5" />
                            My Widgets
                        </div>
                        <h2 className="mt-2 text-2xl font-semibold text-white">Previously created widgets</h2>
                        <p className="mt-2 text-sm leading-7 text-zinc-400">
                            Load an existing widget, copy its hosted link again, or revoke it when you no longer want the public embed active.
                        </p>
                    </div>

                    {refreshingTokens ? (
                        <div className="inline-flex items-center gap-2 text-sm text-zinc-500">
                            <RefreshCcw className="h-4 w-4 animate-spin" />
                            Refreshing
                        </div>
                    ) : null}
                </div>

                <div className="mt-5 overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#091018]">
                    {loadingTokens ? (
                        <div className="flex items-center justify-center gap-3 px-5 py-12 text-zinc-400">
                            <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
                            Loading widgets...
                        </div>
                    ) : tokens.length === 0 ? (
                        <div className="px-5 py-12 text-center">
                            <div className="text-base font-medium text-white">No widgets yet</div>
                            <p className="mt-2 text-sm text-zinc-500">
                                Enter a domain above and click Get My Embed Code to create your first widget.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/[0.06]">
                            {tokens.map((token) => {
                                const tokenUrl = `${appOrigin}/embed/reddit/${token.token}`;
                                const isSelected = currentWidget?.token === token.token;

                                return (
                                    <div
                                        key={token.token}
                                        className={`dashboard-hover-item flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${
                                            isSelected ? 'bg-orange-500/[0.04]' : ''
                                        }`}
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded-[8px] border border-orange-400/20 bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-200">
                                                    Reddit
                                                </span>
                                                <span className="truncate text-sm font-semibold text-white">{token.domain}</span>
                                                <span className="text-xs text-zinc-500">Created {formatCreatedAt(token.created_at)}</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                            <CopyButton
                                                label="Copy Link"
                                                copied={copiedId === `token-url-${token.token}`}
                                                onClick={() => void copyValue(tokenUrl, `token-url-${token.token}`)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => void handleLoadWidget(token)}
                                                className="inline-flex min-h-[42px] items-center gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-zinc-300 transition hover:border-orange-400/30 hover:bg-orange-500/10 hover:text-white"
                                            >
                                                Load
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleRevoke(token.token)}
                                                disabled={revokingToken === token.token}
                                                className="inline-flex min-h-[42px] items-center gap-2 rounded-[10px] border border-red-400/20 bg-red-500/[0.08] px-3.5 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {revokingToken === token.token ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                Revoke
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </DashboardHoverSurface>

            <DashboardHoverSurface
                as="section"
                tone="mixed"
                className="border border-white/[0.08] bg-[linear-gradient(180deg,rgba(34,211,238,0.05),rgba(12,17,23,0.96))] px-5 py-5 shadow-[0_14px_36px_rgba(0,0,0,0.14)]"
            >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                        <div className="dashboard-hover-chip inline-flex items-center gap-2 rounded-[10px] border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300" data-tone="cyan">
                            Also available
                        </div>
                        <h2 className="text-xl font-semibold text-white">Need X mentions too?</h2>
                        <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                            The same copy-paste flow is available for X so you can embed both conversations side by side.
                        </p>
                    </div>

                    <Link
                        href="/dashboard/x-api"
                        data-variant="ghost"
                        className="dashboard-hover-action inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[10px] border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-200 transition hover:border-cyan-400/30 hover:bg-cyan-500/14 hover:text-white"
                    >
                        Open X mentions
                        <ExternalLink className="h-4 w-4" />
                    </Link>
                </div>
            </DashboardHoverSurface>
        </div>
    );
}

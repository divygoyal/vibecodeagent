'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowRight,
    Check,
    Copy,
    Globe2,
    Link2,
    Loader2,
    RefreshCcw,
    Sparkles,
    Trash2,
} from 'lucide-react';

import XMentionsLockup from '@/components/social/XMentionsMark';
import { XWidgetSurface } from '@/components/social/XWebsiteEmbed';
import {
    buildXEmbedCode,
    DEFAULT_X_WIDGET_CONFIG,
    normalizeXWidgetConfig,
    type SocialEmbedTokenRecord,
} from '@/lib/socialEmbeds';
import { canonicalizeDomainInput, type XMentionPayload } from '@/lib/xMentionsShared';

type MentionFetchResult = {
    canonicalDomain: string;
    mentions: XMentionPayload[];
    warning?: string;
    error?: string;
};

type DemoState = {
    status: 'loading' | 'ready' | 'error';
    mentions: XMentionPayload[];
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
            className="inline-flex min-h-[42px] items-center gap-2 rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-zinc-300 transition hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : label}
        </button>
    );
}

function CodeBlock({ code }: { code: string }) {
    return (
        <pre className="overflow-x-auto rounded-[18px] border border-white/[0.08] bg-[#0a0f14] px-4 py-4 text-[12px] leading-6 text-zinc-300">
            <code>{code}</code>
        </pre>
    );
}

export default function XApiPage() {
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
        const response = await fetch('/api/x-mentions', {
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
            throw new Error(error || 'Failed to load X mentions right now.');
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
            const response = await fetch('/api/social-embeds/tokens?platform=x', { cache: 'no-store' });
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
    const embedUrl = currentWidget ? `${appOrigin}/embed/x/${currentWidget.token}` : null;
    const embedCode = currentWidget ? buildXEmbedCode({ token: currentWidget.token, origin: appOrigin }) : '';
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
            platform: 'x',
            domain: preview.canonicalDomain,
            label: `${preview.canonicalDomain} X mentions`,
            config: DEFAULT_X_WIDGET_CONFIG,
        };

        const response = await fetch('/api/social-embeds/tokens', {
            method: currentWidget ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
                currentWidget
                    ? { token: currentWidget.token, ...payload }
                    : payload
            ),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Failed to save your X widget.');
        }

        return {
            ...data,
            config: normalizeXWidgetConfig(data.config),
        } as SocialEmbedTokenRecord;
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
                currentWidget
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
        <div className="space-y-8 pb-12">
            <section className="overflow-hidden rounded-[30px] border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.1),transparent_38%),linear-gradient(180deg,#0b1016_0%,#080c12_100%)] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.22)] sm:p-8 lg:p-10">
                <div className="max-w-5xl space-y-6">
                    <XMentionsLockup iconClassName="h-5 w-5 text-white" textClassName="text-sm font-semibold uppercase tracking-[0.26em] text-white" />

                    <div className="space-y-3">
                        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                            Embed your Twitter/X mentions in your website
                        </h1>

                        <div className="flex flex-wrap items-center gap-3">
                            {STEP_ITEMS.map((step, index) => (
                                <div key={step} className="flex items-center gap-3">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-zinc-300">
                                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-xs font-semibold text-emerald-300">
                                            {index + 1}
                                        </span>
                                        {step}
                                    </div>
                                    {index < STEP_ITEMS.length - 1 ? <ArrowRight className="h-4 w-4 text-zinc-700" /> : null}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-[24px] border border-white/[0.08] bg-[#0a0f14]/90 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.22)] sm:p-6">
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-white" htmlFor="x-domain-input">
                                    Website domain
                                </label>
                                <div className="flex items-center gap-3 rounded-[18px] border border-white/[0.08] bg-[#05080d] px-4 py-4">
                                    <Globe2 className="h-5 w-5 text-cyan-300" />
                                    <input
                                        id="x-domain-input"
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
                                className="inline-flex min-h-[58px] items-center justify-center gap-2 rounded-[18px] border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.95),rgba(34,211,238,0.82))] px-6 py-4 text-base font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                                {submitting ? 'Generating...' : 'Get My Embed Code'}
                            </button>
                        </div>

                        {resolvedDomain ? (
                            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-500/[0.08] px-3 py-1.5 text-sm text-emerald-200">
                                Ready for <span className="font-semibold">{resolvedDomain}</span>
                            </div>
                        ) : null}

                        {currentWidget ? (
                            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
                                <span>
                                    Editing saved widget for <span className="font-semibold text-white">{currentWidget.domain}</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={handleStartNew}
                                    className="text-cyan-300 transition hover:text-cyan-200"
                                >
                                    Start a new widget
                                </button>
                            </div>
                        ) : null}

                        {hasPendingChanges ? (
                            <div className="mt-5 rounded-[18px] border border-cyan-400/20 bg-cyan-500/[0.08] px-4 py-3 text-sm text-cyan-100">
                                Preview updates immediately here. Click <span className="font-semibold">Get My Embed Code</span> to save the latest domain to your hosted widget.
                            </div>
                        ) : null}

                        {formError ? (
                            <div className="mt-5 rounded-[18px] border border-red-400/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200">
                                {formError}
                            </div>
                        ) : null}

                        {notice ? (
                            <div className="mt-5 rounded-[18px] border border-emerald-400/15 bg-emerald-500/[0.08] px-4 py-3 text-sm text-emerald-200">
                                {notice}
                            </div>
                        ) : null}
                    </div>
                </div>
            </section>

            <section className="rounded-[28px] border border-white/[0.08] bg-[#0c1117] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-6">
                <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                        <Sparkles className="h-3.5 w-3.5" />
                        Preview
                    </div>
                    <h2 className="text-2xl font-semibold text-white">
                        {isShowingUserPreview ? previewDomain : 'trafficclaw.com'}
                    </h2>
                    <p className="text-sm leading-7 text-zinc-400">
                        {isShowingUserPreview
                            ? `Showing the latest mentions we found for ${previewDomain}.`
                            : 'Showing the latest mentions from trafficclaw.com until you generate your own widget.'}
                    </p>
                </div>

                <div className="mt-5">
                    <XWidgetSurface
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
                        <div className="rounded-[24px] border border-white/[0.08] bg-[#091018] p-4 sm:p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                                        <Link2 className="h-3.5 w-3.5" />
                                        Get Your Code
                                    </div>
                                    <div className="mt-2 text-sm text-zinc-400">
                                        Paste this on your website to show the live X mentions widget for <span className="font-semibold text-zinc-200">{currentWidget.domain}</span>.
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
                            <div className="rounded-[24px] border border-white/[0.08] bg-[#091018] p-4 sm:p-5">
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

                                <div className="mt-4 rounded-[18px] border border-white/[0.08] bg-[#0a0f14] px-4 py-4 text-sm text-zinc-300">
                                    <div className="break-all">{embedUrl}</div>
                                </div>
                            </div>

                            <div className="rounded-[24px] border border-emerald-400/15 bg-[linear-gradient(180deg,rgba(16,185,129,0.12),rgba(9,16,24,0.96))] p-4 sm:p-5">
                                <div className="text-sm font-medium text-white">Done</div>
                                <p className="mt-2 text-sm leading-6 text-zinc-200">
                                    TrafficClaw keeps the same hosted widget URL active and refreshes the mentions daily behind the scenes.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : null}
            </section>

            <section className="rounded-[28px] border border-white/[0.08] bg-[#0c1117] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-6">
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
                            <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
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
                                const tokenUrl = `${appOrigin}/embed/x/${token.token}`;
                                const isSelected = currentWidget?.token === token.token;

                                return (
                                    <div
                                        key={token.token}
                                        className={`flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${
                                            isSelected ? 'bg-cyan-500/[0.04]' : ''
                                        }`}
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300">
                                                    X
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
                                                className="inline-flex min-h-[42px] items-center gap-2 rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-zinc-300 transition hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-white"
                                            >
                                                Load
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleRevoke(token.token)}
                                                disabled={revokingToken === token.token}
                                                className="inline-flex min-h-[42px] items-center gap-2 rounded-[14px] border border-red-400/20 bg-red-500/[0.08] px-3.5 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
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
            </section>

            <section className="rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(59,130,246,0.05),rgba(12,17,23,0.96))] px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
                            Coming soon
                        </div>
                        <h2 className="text-xl font-semibold text-white">Reddit mentions are next</h2>
                        <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                            We&apos;re building the same copy-paste flow for Reddit so you can embed real community posts too.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}

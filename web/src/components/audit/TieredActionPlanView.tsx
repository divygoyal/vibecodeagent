'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Copy, Sparkles, Lock, RefreshCw, AlertTriangle, Clock, Zap } from 'lucide-react';
import FixWithBotButton from '@/components/FixWithBotButton';
import { IssuesPanel } from '@/components/domain-overview/IssuesPanel';
import type { DomainOverviewData } from '@/components/domain-overview/types';
import type { AuditReport } from '@/lib/siteAudit';
import type { Recommendation, RecommendationFix, Tier, TieredActionPlan } from '@/lib/auditSynth';

interface Props {
    url: string;
    domain: string;
    auditReport: AuditReport;
    /** Optional GSC site URL to enrich the synthesis. Pass only if the user has connected that property. */
    optionalGscSiteUrl?: string;
    /** Resolved subscription plan. Free users see a fallback view. */
    userPlan?: 'free' | 'starter' | 'growth' | 'pro';
    /** Wrapper for the existing IssuesPanel-shaped data (free-tier fallback). */
    domainOverviewData?: DomainOverviewData;
}

type StreamState =
    | { kind: 'idle' }
    | { kind: 'streaming'; status: string; cached: boolean }
    | { kind: 'done'; plan: TieredActionPlan; cached: boolean }
    | { kind: 'upgrade' }
    | { kind: 'error'; message: string };

const TIER_LABEL: Record<Tier, string> = {
    tier1: 'Tier 1 — Quick wins',
    tier2: 'Tier 2 — This week',
    tier3: 'Tier 3 — This month',
};
const TIER_TIME: Record<Tier, string> = {
    tier1: '<1 day',
    tier2: '<1 week',
    tier3: '<1 month',
};
const TIER_ICON_BG: Record<Tier, string> = {
    tier1: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    tier2: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
    tier3: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
};

export default function TieredActionPlanView({ url, domain, auditReport, optionalGscSiteUrl, userPlan, domainOverviewData }: Props) {
    const [state, setState] = useState<StreamState>({ kind: 'idle' });

    const isFree = !userPlan || userPlan === 'free';

    const handleGenerate = useCallback(async () => {
        if (isFree) {
            setState({ kind: 'upgrade' });
            return;
        }
        setState({ kind: 'streaming', status: 'Starting…', cached: false });
        try {
            const res = await fetch('/api/audit/synthesize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auditReport, optionalGscSiteUrl }),
            });
            if (res.status === 402) {
                setState({ kind: 'upgrade' });
                return;
            }
            if (!res.ok || !res.body) {
                setState({ kind: 'error', message: `Synthesis failed (HTTP ${res.status})` });
                return;
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let cached = false;
            let lastStatus = 'Generating…';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');
                buffer = events.pop() ?? '';
                for (const ev of events) {
                    const trimmed = ev.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const payload = trimmed.slice(5).trim();
                    if (payload === '[DONE]') continue;
                    try {
                        const data = JSON.parse(payload);
                        if (data.type === 'status') {
                            lastStatus = String(data.message ?? 'Working…');
                            setState({ kind: 'streaming', status: lastStatus, cached });
                        } else if (data.type === 'cached') {
                            cached = !!data.value;
                        } else if (data.type === 'plan') {
                            setState({ kind: 'done', plan: data.plan as TieredActionPlan, cached });
                        } else if (data.type === 'error') {
                            setState({ kind: 'error', message: String(data.message ?? 'Synthesis error') });
                        }
                    } catch {
                        // ignore malformed SSE chunk
                    }
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Network error';
            setState({ kind: 'error', message: msg });
        }
    }, [auditReport, isFree, optionalGscSiteUrl]);

    // ── Free-tier fallback: show legacy IssuesPanel + upsell ──
    if (isFree) {
        return (
            <div className="space-y-6">
                {domainOverviewData && (
                    <IssuesPanel data={domainOverviewData} domain={domain} auditUrl={url} />
                )}
                <UpsellCard />
            </div>
        );
    }

    // ── Paid: render based on state ──
    if (state.kind === 'idle') {
        return (
            <GenerateHero
                onGenerate={handleGenerate}
                auditReport={auditReport}
                domain={domain}
                domainOverviewData={domainOverviewData}
                url={url}
            />
        );
    }

    if (state.kind === 'upgrade') {
        return <UpsellCard />;
    }

    if (state.kind === 'streaming') {
        return <StreamingSkeleton status={state.status} />;
    }

    if (state.kind === 'error') {
        return (
            <div className="premium-card rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                    <h3 className="text-sm font-semibold">Synthesis failed</h3>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">{state.message}</p>
                <button onClick={handleGenerate} className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300">
                    <RefreshCw className="w-3 h-3" /> Try again
                </button>
            </div>
        );
    }

    // state.kind === 'done'
    return (
        <div className="space-y-6">
            <PlanSummary plan={state.plan} cached={state.cached} onRegenerate={handleGenerate} />
            <TierSection tier="tier1" recs={state.plan.tier1} domain={domain} />
            <TierSection tier="tier2" recs={state.plan.tier2} domain={domain} />
            <TierSection tier="tier3" recs={state.plan.tier3} domain={domain} />
        </div>
    );
}

// ─── Hero / Generate state ───

function GenerateHero({
    onGenerate,
    auditReport,
    domain,
    domainOverviewData,
    url,
}: {
    onGenerate: () => void;
    auditReport: AuditReport;
    domain: string;
    domainOverviewData?: DomainOverviewData;
    url: string;
}) {
    return (
        <div className="space-y-6">
            <div className="premium-card rounded-2xl p-6 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 border border-emerald-500/20">
                <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-black" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Generate AI Action Plan</h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-prose">
                            Turn this audit into 12-18 paste-ready recommendations, grouped by effort (under a day / under a week / under a month).
                            Every fix is drafted for {domain} — no generic checklists.
                        </p>
                        <div className="mt-4 flex items-center gap-3">
                            <button
                                onClick={onGenerate}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-black text-xs font-semibold shadow-lg shadow-emerald-500/10 hover:opacity-90 transition"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                Generate Action Plan
                            </button>
                            <span className="text-[11px] text-[var(--text-muted)]">~10-15 seconds · 1 credit</span>
                        </div>
                    </div>
                </div>
            </div>
            {domainOverviewData && (
                <details className="premium-card rounded-2xl p-6">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)] inline-flex items-center gap-2">
                        <ChevronDown className="w-3.5 h-3.5" />
                        View raw audit findings ({auditReport.summary.total})
                    </summary>
                    <div className="mt-4">
                        <IssuesPanel data={domainOverviewData} domain={domain} auditUrl={url} />
                    </div>
                </details>
            )}
        </div>
    );
}

// ─── Streaming skeleton ───

function StreamingSkeleton({ status }: { status: string }) {
    return (
        <div className="premium-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center animate-pulse">
                    <Sparkles className="w-4 h-4 text-black" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Generating action plan</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{status}</p>
                </div>
            </div>
            <div className="space-y-3">
                {[0, 1, 2].map(i => (
                    <div key={i} className="space-y-2">
                        <div className="h-4 w-32 bg-[var(--card-bg)] rounded animate-pulse" />
                        <div className="h-20 bg-[var(--card-bg)] rounded-lg animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Plan summary ───

function PlanSummary({ plan, cached, onRegenerate }: { plan: TieredActionPlan; cached: boolean; onRegenerate: () => void }) {
    const totalRecs = plan.tier1.length + plan.tier2.length + plan.tier3.length;
    const tier1Hours = plan.tier1.reduce((s, r) => s + (r.effortHours || 0), 0);
    return (
        <div className="premium-card rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Action plan ready</h3>
                        {cached && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-muted)]">cached · 24h</span>
                        )}
                        {plan.degraded && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">degraded</span>
                        )}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">{plan.summary}</p>
                    <div className="mt-4 flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
                        <span><strong className="text-[var(--text-primary)]">{totalRecs}</strong> recommendations</span>
                        <span><strong className="text-[var(--text-primary)]">{tier1Hours}h</strong> of quick wins</span>
                        <span>Site type: <strong className="text-[var(--text-primary)]">{plan.siteType}</strong></span>
                    </div>
                </div>
                <button
                    onClick={onRegenerate}
                    className="shrink-0 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1"
                    title="Regenerate plan"
                >
                    <RefreshCw className="w-3 h-3" /> Regenerate
                </button>
            </div>
        </div>
    );
}

// ─── Tier section ───

function TierSection({ tier, recs, domain }: { tier: Tier; recs: Recommendation[]; domain: string }) {
    if (recs.length === 0) {
        return null;
    }
    const totalHours = recs.reduce((s, r) => s + (r.effortHours || 0), 0);
    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${TIER_ICON_BG[tier]}`}>
                        <Zap className="w-3 h-3" />
                        {TIER_LABEL[tier]}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">{TIER_TIME[tier]} · {recs.length} item{recs.length === 1 ? '' : 's'} · ~{totalHours}h total</span>
                </div>
            </div>
            <div className="space-y-3">
                {recs.map(rec => <RecommendationCard key={rec.id} rec={rec} domain={domain} />)}
            </div>
        </section>
    );
}

// ─── Recommendation card ───

function RecommendationCard({ rec, domain }: { rec: Recommendation; domain: string }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="premium-card rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                    {rec.severity && (
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${severityDot(rec.severity)}`} aria-label={rec.severity} />
                    )}
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{rec.title}</p>
                        {rec.problem && (
                            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{rec.problem}</p>
                        )}
                    </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                    <ImpactChip impact={rec.impact} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-muted)] inline-flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        ~{rec.effortHours}h
                    </span>
                </div>
            </div>
            <FixBlock fix={rec.fix} />
            <div className="mt-3 flex items-center gap-3">
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1"
                >
                    <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    Why this matters
                </button>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-muted)]">{rec.category}</span>
                <div className="ml-auto">
                    <FixWithBotButton
                        label="Iterate with AI"
                        size="sm"
                        variant="ghost"
                        context={`Refine this fix for ${domain}:\n\nTitle: ${rec.title}\nProblem: ${rec.problem}\nProposed fix: ${rec.fix.content}\nRationale: ${rec.rationale}`}
                    />
                </div>
            </div>
            {expanded && rec.rationale && (
                <p className="mt-3 text-xs text-[var(--text-secondary)] leading-relaxed border-l-2 border-[var(--card-border)] pl-3">
                    {rec.rationale}
                </p>
            )}
        </div>
    );
}

// ─── Fix block ───

function FixBlock({ fix }: { fix: RecommendationFix }) {
    const isCode = fix.type === 'code' || fix.type === 'config';
    const language = fix.language || (isCode ? 'html' : '');
    return (
        <div className="mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--card-border)] bg-black/20">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{fix.type}</span>
                    {language && <span className="text-[10px] text-[var(--text-muted)]">· {language}</span>}
                    {fix.location && (
                        <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[300px]" title={fix.location}>· {fix.location}</span>
                    )}
                </div>
                <CopyButton text={fix.content} />
            </div>
            <pre className="px-3 py-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words text-[var(--text-primary)] font-mono">
{fix.content}
            </pre>
        </div>
    );
}

// ─── Copy button ───

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const onClick = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // older browser — fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
            document.body.removeChild(ta);
        }
    }, [text]);
    return (
        <button
            onClick={onClick}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-emerald-400 transition-colors"
        >
            {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
    );
}

// ─── Impact chip ───

function ImpactChip({ impact }: { impact: Recommendation['impact'] }) {
    const cls = useMemo(() => {
        if (impact === 'high') return 'bg-red-500/10 border-red-500/20 text-red-400';
        if (impact === 'medium') return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
        return 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400';
    }, [impact]);
    return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>
            {impact}
        </span>
    );
}

function severityDot(sev: 'critical' | 'warning' | 'info'): string {
    if (sev === 'critical') return 'bg-red-500';
    if (sev === 'warning') return 'bg-amber-500';
    return 'bg-blue-500';
}

// ─── Upsell card (free tier) ───

function UpsellCard() {
    return (
        <div className="premium-card rounded-2xl p-6 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20">
            <div className="flex items-start gap-4">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-zinc-900/40 border border-emerald-500/30 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI Action Plan — Starter+</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-prose leading-relaxed">
                        Get tiered, paste-ready fixes for your audit issues. Drafted meta descriptions, schema blobs,
                        CTA copy, and CRO recommendations — grouped by effort (under a day / under a week / under a month).
                    </p>
                    <Link
                        href="/dashboard/plan"
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-black text-xs font-semibold shadow-lg shadow-emerald-500/10 hover:opacity-90 transition"
                    >
                        Upgrade to Starter
                    </Link>
                </div>
            </div>
        </div>
    );
}

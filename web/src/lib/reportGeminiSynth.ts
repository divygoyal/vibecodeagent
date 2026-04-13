/**
 * Gemini Synthesis — sends ALL raw data + analysis to Gemini via
 * 2 comprehensive calls and returns typed JSON for the PDF template.
 *
 * Call 1: Full site diagnosis (exec summary, anomalies, traffic DNA, critical problems)
 * Call 2: Fixes, action plan, page optimizations
 */

import { GoogleGenAI } from '@google/genai';
import type { ReportAnalysis } from './reportAnalysis';
import type { ReportPeriod, ReportRawData } from './reportDataFetcher';
import { isLatinSafe } from './reportDataFetcher';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = 'gemini-3-flash-preview';
const MAX_TOKENS = 8192;
const MAX_RETRIES = 2;

// ─── Output Types ───

export interface GeminiReportOutput {
    // Call 1
    executiveSummary: {
        healthStatus: 'growing' | 'stable' | 'at_risk' | 'declining';
        narrative: string;
        highlights: string[];
        oneAction: string;
        oneActionWhy: string;
        oneActionImpact: string;
    };
    anomalyExplanations: Array<{
        date: string;
        rootCause: string;
        impact: string;
        howToFix: string;
    }>;
    trafficDNAInterpretation: string;
    criticalProblems: Array<{
        title: string;
        explanation: string;
        fix: string;
    }>;

    // Call 2
    keywordAccelCommentary: string;
    keywordDecelCommentary: string;
    keywordFixes: Array<{
        keyword: string;
        diagnosis: string;
        fixSteps: string;
    }>;
    decayOverview: string;
    decayFixes: Array<{
        page: string;
        diagnosis: string;
        refreshStrategy: string;
    }>;
    cannibalizationOverview: string;
    cannibalizationFixes: Array<{
        query: string;
        recommendation: string;
        steps: string;
    }>;
    opportunityOverview: string;
    opportunityStrategies: Array<{
        keyword: string;
        strategy: string;
        timeline: string;
    }>;
    revenueNarrative: string;
    actionPlanThisWeek: Array<{
        action: string;
        effort: 'low' | 'medium' | 'high';
        impact: 'low' | 'medium' | 'high';
    }>;
    actionPlanThisMonth: Array<{
        action: string;
        effort: 'low' | 'medium' | 'high';
        impact: 'low' | 'medium' | 'high';
    }>;
    pageOptimizations: Array<{
        page: string;
        issues: string;
        fixes: string;
    }>;
}

// ─── Raw Data Formatters ───

function fmtDailyGA4(raw: ReportRawData): string {
    return raw.ga4.dailyCurrent.map(d =>
        `${d.date}: ${d.sessions} sessions, ${d.activeUsers} users, ${d.pageviews} pvs, bounce ${(d.bounceRate * 100).toFixed(0)}%, duration ${Math.round(d.avgSessionDuration)}s`
    ).join('\n');
}

function fmtDailyGSC(raw: ReportRawData): string {
    return raw.gsc.dailyCurrent.map(d =>
        `${d.date}: ${d.clicks} clicks, ${d.impressions} impressions, CTR ${(d.ctr * 100).toFixed(1)}%, pos ${d.position.toFixed(1)}`
    ).join('\n');
}

function fmtQueries(raw: ReportRawData, limit = 30): string {
    const current = raw.gsc.queriesCurrent.filter(q => isLatinSafe(q.query)).slice(0, limit);
    const prevMap = new Map(raw.gsc.queriesPrev.map(q => [q.query, q]));
    return current.map(q => {
        const prev = prevMap.get(q.query);
        const prevStr = prev ? `prev: ${prev.clicks}cl/${prev.impressions}imp/pos${prev.position.toFixed(1)}` : 'NEW';
        return `"${q.query}": ${q.clicks}cl, ${q.impressions}imp, pos ${q.position.toFixed(1)}, CTR ${(q.ctr * 100).toFixed(1)}% | ${prevStr}`;
    }).join('\n');
}

function fmtPages(raw: ReportRawData, limit = 20): string {
    const prevMap = new Map(raw.gsc.pagesPrev.map(p => [p.page, p]));
    return raw.gsc.pagesCurrent.slice(0, limit).map(p => {
        const prev = prevMap.get(p.page);
        const delta = prev ? `(was ${prev.clicks}cl/pos${prev.position.toFixed(1)})` : '(new)';
        return `${p.page}: ${p.clicks}cl, ${p.impressions}imp, pos ${p.position.toFixed(1)}, CTR ${(p.ctr * 100).toFixed(1)}% ${delta}`;
    }).join('\n');
}

function fmtChannels(raw: ReportRawData): string {
    const totalCur = raw.ga4.channelsCurrent.reduce((s, c) => s + c.sessions, 0) || 1;
    const totalPrev = raw.ga4.channelsPrev.reduce((s, c) => s + c.sessions, 0) || 1;
    const prevMap = new Map(raw.ga4.channelsPrev.map(c => [c.channel, c]));
    return raw.ga4.channelsCurrent.map(c => {
        const pct = ((c.sessions / totalCur) * 100).toFixed(1);
        const prev = prevMap.get(c.channel);
        const prevPct = prev ? ((prev.sessions / totalPrev) * 100).toFixed(1) : '0';
        return `${c.channel}: ${pct}% (${c.sessions} sessions) — prev ${prevPct}%`;
    }).join('\n');
}

// ─── Prompt Builders ───

function buildPrompt1(analysis: ReportAnalysis, period: ReportPeriod, siteUrl: string, raw: ReportRawData): string {
    const periodLabel = period.type === 'weekly' ? 'week' : 'month';
    const kpi = analysis.kpis;
    const ga4Availability = raw.hasGa4
        ? 'GA4 traffic data is available for this report.'
        : 'GA4 traffic data is unavailable for this report. This is a Search Console-only report. Do not describe users, sessions, bounce rate, pageviews, device mix, country mix, traffic channels, or traffic anomalies as measured values.';
    const ga4Kpis = raw.hasGa4
        ? `- Users: ${kpi.users} (${kpi.usersDelta > 0 ? '+' : ''}${kpi.usersDelta}%)
- Sessions: ${kpi.sessions} (${kpi.sessionsDelta > 0 ? '+' : ''}${kpi.sessionsDelta}%)
- Bounce Rate: ${(kpi.bounceRate * 100).toFixed(1)}% (delta ${(kpi.bounceRateDelta * 100).toFixed(1)}pp)
- New User Ratio: ${kpi.newUserRatio}%
- Avg Session Duration: ${kpi.avgSessionDuration}s
- Pageviews: ${kpi.pageviews} (${kpi.pageviewsDelta > 0 ? '+' : ''}${kpi.pageviewsDelta}%)`
        : '- GA4 metrics unavailable for this report';
    const ga4Sections = raw.hasGa4
        ? `## Daily GA4 Metrics
${fmtDailyGA4(raw)}

## Channel Mix
${fmtChannels(raw)}

## Devices
${analysis.trafficDNA.devices.map(d => `${d.device}: ${d.currentShare}% (${d.shareDelta > 0 ? '+' : ''}${d.shareDelta}pp)`).join(', ')}

## Countries
${analysis.trafficDNA.countries.map(c => `${c.country}: ${c.currentShare}% (${c.shareDelta > 0 ? '+' : ''}${c.shareDelta}pp)`).join(', ')}

## Anomaly Days (z-score > 1.5)
${analysis.anomalies.length === 0 ? 'No statistically significant session anomalies (stddev-based).' : analysis.anomalies.map(a =>
        `- ${a.dayName} ${a.date}: ${a.actual} sessions vs ~${a.expected} expected (${a.deviationPercent > 0 ? '+' : ''}${a.deviationPercent}%, ${a.severity})`
    ).join('\n')}`
        : `## GA4-Dependent Sections
Unavailable because Google Analytics 4 is not connected for this user. Explain that traffic composition and session-anomaly analysis are not part of this report.`;

    return `You are a senior SEO analyst writing an in-depth ${periodLabel}ly diagnostic for ${siteUrl}.
Period: ${period.startDate} to ${period.endDate} vs previous ${periodLabel} (${period.prevStartDate} to ${period.prevEndDate}).
Report mode: ${raw.reportMode === 'gsc_only' ? 'Search Console-only' : 'GA4 + Search Console'}.

YOUR JOB: Find EVERY problem, anomaly, and risk in this data. Be SPECIFIC with dates, numbers, and root causes. Give VERDICTS, not generic advice. If data is sparse, explain what that means and what the user should do about it.
${ga4Availability}

## Traffic KPIs
${ga4Kpis}

## Search KPIs (current vs previous)
- Organic Clicks: ${kpi.clicks} (${kpi.clicksDelta > 0 ? '+' : ''}${kpi.clicksDelta}%)
- Impressions: ${kpi.impressions} (${kpi.impressionsDelta > 0 ? '+' : ''}${kpi.impressionsDelta}%)
- Avg Position: ${kpi.avgPosition} (delta ${kpi.avgPositionDelta > 0 ? '+' : ''}${kpi.avgPositionDelta})

## Critical Alerts (auto-detected)
${analysis.criticalAlerts.length === 0 ? 'None detected by automated system.' : analysis.criticalAlerts.map(a => `- [${a.severity.toUpperCase()}] ${a.title}: ${a.detail}`).join('\n')}

## Daily GSC Metrics
${fmtDailyGSC(raw)}

## All Search Queries (current vs previous)
${fmtQueries(raw)}

## All Pages in Search (current vs previous)
${fmtPages(raw)}

${ga4Sections}

Respond with ONLY valid JSON (no markdown fences):
{
  "executiveSummary": {
    "healthStatus": "growing|stable|at_risk|declining",
    "narrative": "6-8 sentence detailed analysis with SPECIFIC numbers, dates, root causes, and verdict. Mention the biggest problems first.",
    "highlights": ["finding with specific number 1", "finding 2", "finding 3", "finding 4", "finding 5"],
    "oneAction": "The single most important action (be specific)",
    "oneActionWhy": "Why this matters with data evidence (2-3 sentences)",
    "oneActionImpact": "Expected result with numbers"
  },
  "anomalyExplanations": [${analysis.anomalies.map(() => `{
      "date": "YYYY-MM-DD",
      "rootCause": "4-5 sentences explaining WHY this happened based on the daily data and channel/query shifts",
      "impact": "Precise traffic impact with numbers",
      "howToFix": "3-4 specific actionable steps"
    }`).join(',')}],
  "trafficDNAInterpretation": "6-8 sentences. If GA4 is available, analyze traffic sources, device mix, and geographic opportunities. If GA4 is unavailable, explicitly say traffic composition is unavailable and explain the operational implication without inventing values.",
  "criticalProblems": [
    {"title": "Problem title", "explanation": "3-4 sentences with evidence from the data", "fix": "3-4 specific numbered steps to fix this"}
  ]
}

For "criticalProblems": identify 3-5 real problems from the data. If organic clicks are near zero, that IS the main problem. If there is a disconnect between GA4 traffic and GSC data, explain it. If pages have zero clicks despite ranking, explain why. Never say "no problems found" — every site has areas to improve.`;
}

function buildPrompt2(analysis: ReportAnalysis, period: ReportPeriod, siteUrl: string, raw: ReportRawData): string {
    const periodLabel = period.type === 'weekly' ? 'week' : 'month';
    const accel = analysis.keywordVelocity.accelerating;
    const decel = analysis.keywordVelocity.decelerating;
    const newKw = analysis.keywordVelocity.newKeywords;
    const lostKw = analysis.keywordVelocity.lostKeywords;
    const decay = analysis.decayPages;
    const cannibal = analysis.cannibalization;
    const opps = analysis.opportunities;
    const pages = analysis.pageGrades;

    return `You are a senior SEO strategist creating a detailed action plan for ${siteUrl}.
Period: ${period.startDate} to ${period.endDate} (${periodLabel}ly report).
Report mode: ${raw.reportMode === 'gsc_only' ? 'Search Console-only' : 'GA4 + Search Console'}.

CRITICAL: Every recommendation must be SPECIFIC and ACTIONABLE. Include real numbers and URLs. No generic advice like "improve content quality."
${raw.hasGa4 ? 'GA4 behavior metrics are available when needed for page context.' : 'GA4 behavior metrics are unavailable. Base recommendations on Search Console data only and do not invent session or bounce-rate evidence.'}

## Accelerating Keywords
${accel.length === 0 ? 'None detected.' : accel.map(k => `- "${k.query}": pos ${k.prevPosition}->${k.currentPosition}, clicks ${k.prevClicks}->${k.currentClicks}, CTR ${k.actualCtr}% (expected ${k.expectedCtr}%), gap ${k.ctrGap}pp`).join('\n')}

## Decelerating Keywords
${decel.length === 0 ? 'None detected.' : decel.map(k => `- "${k.query}": pos ${k.prevPosition}->${k.currentPosition}, clicks ${k.prevClicks}->${k.currentClicks}, CTR ${k.actualCtr}% (expected ${k.expectedCtr}%), gap ${k.ctrGap}pp`).join('\n')}

## New Keywords (appeared this period)
${newKw.length === 0 ? 'None.' : newKw.map(k => `- "${k.query}": ${k.clicks}cl, ${k.impressions}imp, pos ${k.position}`).join('\n')}

## Lost Keywords (disappeared this period)
${lostKw.length === 0 ? 'None.' : lostKw.map(k => `- "${k.query}": was ${k.clicks}cl, ${k.impressions}imp, pos ${k.position}`).join('\n')}

## Content Decay (${decay.length} pages)
${decay.length === 0 ? 'No decay detected.' : decay.slice(0, 8).map(p => `- ${p.page}: clicks ${p.prevClicks}->${p.currentClicks} (${p.decayRate}%), pos ${p.prevPosition}->${p.currentPosition}, CTR ${p.currentCtr}%`).join('\n')}

## Cannibalization (${cannibal.length} groups)
${cannibal.length === 0 ? 'None detected.' : cannibal.slice(0, 5).map(c => `- "${c.query}" (${c.totalImpressions} impr): ${c.pages.map(p => `${p.page} [${p.clicks}cl, pos ${p.position}]`).join(' vs ')}`).join('\n')}

## Opportunities (${opps.length} found, est. $${analysis.totalRevenueEstimate}/mo)
${opps.slice(0, 10).map(o => `- "${o.query}" pos ${o.position.toFixed(1)}, ${o.impressions} impr, potential +${o.potentialClicks} clicks (~$${o.revenueEstimate}/mo), type: ${o.type}`).join('\n')}

## Pages Performance
${pages.slice(0, 10).map(p => `- ${p.page}: grade ${p.grade}, pos ${p.position}, CTR ${p.ctr}%, ${p.clicks} clicks (delta ${p.clickDelta}), bounce ${p.bounceRate}%`).join('\n')}

## All Search Queries (raw data for context)
${fmtQueries(raw, 20)}

## All Pages in Search (raw data for context)
${fmtPages(raw, 15)}

## Key Stats
- Total organic clicks: ${analysis.kpis.clicks} (${analysis.kpis.clicksDelta > 0 ? '+' : ''}${analysis.kpis.clicksDelta}%)
- Total impressions: ${analysis.kpis.impressions} (${analysis.kpis.impressionsDelta > 0 ? '+' : ''}${analysis.kpis.impressionsDelta}%)
- Decay pages: ${decay.length} | Cannibalization: ${cannibal.length} | Opportunities: ${opps.length}

Respond with ONLY valid JSON (no markdown fences):
{
  "keywordAccelCommentary": "3-4 sentences analyzing accelerating keywords. If none, explain what this means for the site and what to do.",
  "keywordDecelCommentary": "3-4 sentences analyzing decelerating keywords with severity. If none, analyze new/lost keywords instead.",
  "keywordFixes": [${decel.slice(0, 5).map(k => `{"keyword": "${k.query.replace(/"/g, '\\"')}", "diagnosis": "2-3 sentences why", "fixSteps": "3-4 numbered steps"}`).join(',')}],
  "decayOverview": "3-4 sentences on content health. If no decay, explain what the data pattern means.",
  "decayFixes": [${decay.slice(0, 3).map(p => `{"page": "${p.page.replace(/"/g, '\\"')}", "diagnosis": "2-3 sentences", "refreshStrategy": "3-4 numbered steps"}`).join(',')}],
  "cannibalizationOverview": "3-4 sentences. If no cannibalization, explain what this means.",
  "cannibalizationFixes": [${cannibal.slice(0, 3).map(c => `{"query": "${c.query.replace(/"/g, '\\"')}", "recommendation": "2 sentences", "steps": "3-4 numbered steps"}`).join(',')}],
  "opportunityOverview": "3-4 sentences on opportunity landscape with total value.",
  "opportunityStrategies": [${opps.slice(0, 5).map(o => `{"keyword": "${o.query.replace(/"/g, '\\"')}", "strategy": "3-4 sentences with specific steps", "timeline": "realistic timeline"}`).join(',')}],
  "revenueNarrative": "3-4 sentences explaining revenue methodology and total value",
  "actionPlanThisWeek": [
    {"action": "Specific action with expected result", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Action 2", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Action 3", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Action 4", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Action 5", "effort": "low|medium|high", "impact": "low|medium|high"}
  ],
  "actionPlanThisMonth": [
    {"action": "Longer-term action 1", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Action 2", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Action 3", "effort": "low|medium|high", "impact": "low|medium|high"}
  ],
  "pageOptimizations": [${pages.filter(p => p.grade === 'D' || p.grade === 'F' || p.grade === 'C').slice(0, 3).map(p => `{"page": "${p.page.replace(/"/g, '\\"')}", "issues": "2-3 sentences", "fixes": "3-4 numbered steps"}`).join(',')}]
}`;
}

// ─── Validation Helpers ───

function str(v: unknown, fallback: string): string {
    return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function strArr(v: unknown, fallback: string[]): string[] {
    if (!Array.isArray(v)) return fallback;
    return v.map(item => (typeof item === 'string' ? item : String(item)));
}

type EffortImpact = 'low' | 'medium' | 'high';
function validEI(v: unknown): EffortImpact {
    if (v === 'low' || v === 'medium' || v === 'high') return v;
    return 'medium';
}

function validateCall1(raw: unknown): Pick<GeminiReportOutput, 'executiveSummary' | 'anomalyExplanations' | 'trafficDNAInterpretation' | 'criticalProblems'> {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const es = (obj.executiveSummary && typeof obj.executiveSummary === 'object' ? obj.executiveSummary : {}) as Record<string, unknown>;

    const validStatuses = new Set(['growing', 'stable', 'at_risk', 'declining']);
    const healthStatus = validStatuses.has(es.healthStatus as string)
        ? (es.healthStatus as GeminiReportOutput['executiveSummary']['healthStatus'])
        : 'stable';

    return {
        executiveSummary: {
            healthStatus,
            narrative: str(es.narrative, ''),
            highlights: strArr(es.highlights, []),
            oneAction: str(es.oneAction, ''),
            oneActionWhy: str(es.oneActionWhy, ''),
            oneActionImpact: str(es.oneActionImpact, ''),
        },
        anomalyExplanations: Array.isArray(obj.anomalyExplanations)
            ? obj.anomalyExplanations.map((a: Record<string, unknown>) => ({
                date: str(a?.date, ''),
                rootCause: str(a?.rootCause, ''),
                impact: str(a?.impact, ''),
                howToFix: str(a?.howToFix, ''),
            }))
            : [],
        trafficDNAInterpretation: str(obj.trafficDNAInterpretation as string, ''),
        criticalProblems: Array.isArray(obj.criticalProblems)
            ? obj.criticalProblems.map((p: Record<string, unknown>) => ({
                title: str(p?.title, ''),
                explanation: str(p?.explanation, ''),
                fix: str(p?.fix, ''),
            })).filter((p: { title: string }) => p.title.length > 0)
            : [],
    };
}

function validateCall2(raw: unknown): Omit<GeminiReportOutput, 'executiveSummary' | 'anomalyExplanations' | 'trafficDNAInterpretation' | 'criticalProblems'> {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

    return {
        keywordAccelCommentary: str(obj.keywordAccelCommentary, ''),
        keywordDecelCommentary: str(obj.keywordDecelCommentary, ''),
        keywordFixes: Array.isArray(obj.keywordFixes)
            ? obj.keywordFixes.map((f: Record<string, unknown>) => ({ keyword: str(f?.keyword, ''), diagnosis: str(f?.diagnosis, ''), fixSteps: str(f?.fixSteps, '') }))
            : [],
        decayOverview: str(obj.decayOverview, ''),
        decayFixes: Array.isArray(obj.decayFixes)
            ? obj.decayFixes.map((f: Record<string, unknown>) => ({ page: str(f?.page, ''), diagnosis: str(f?.diagnosis, ''), refreshStrategy: str(f?.refreshStrategy, '') }))
            : [],
        cannibalizationOverview: str(obj.cannibalizationOverview, ''),
        cannibalizationFixes: Array.isArray(obj.cannibalizationFixes)
            ? obj.cannibalizationFixes.map((f: Record<string, unknown>) => ({ query: str(f?.query, ''), recommendation: str(f?.recommendation, ''), steps: str(f?.steps, '') }))
            : [],
        opportunityOverview: str(obj.opportunityOverview, ''),
        opportunityStrategies: Array.isArray(obj.opportunityStrategies)
            ? obj.opportunityStrategies.map((s: Record<string, unknown>) => ({ keyword: str(s?.keyword, ''), strategy: str(s?.strategy, ''), timeline: str(s?.timeline, '2-4 weeks') }))
            : [],
        revenueNarrative: str(obj.revenueNarrative, ''),
        actionPlanThisWeek: Array.isArray(obj.actionPlanThisWeek)
            ? obj.actionPlanThisWeek.map((a: Record<string, unknown>) => ({ action: str(a?.action, ''), effort: validEI(a?.effort), impact: validEI(a?.impact) })).filter((a: { action: string }) => a.action.length > 0)
            : [],
        actionPlanThisMonth: Array.isArray(obj.actionPlanThisMonth)
            ? obj.actionPlanThisMonth.map((a: Record<string, unknown>) => ({ action: str(a?.action, ''), effort: validEI(a?.effort), impact: validEI(a?.impact) })).filter((a: { action: string }) => a.action.length > 0)
            : [],
        pageOptimizations: Array.isArray(obj.pageOptimizations)
            ? obj.pageOptimizations.map((p: Record<string, unknown>) => ({ page: str(p?.page, ''), issues: str(p?.issues, ''), fixes: str(p?.fixes, '') }))
            : [],
    };
}

// ─── Gemini Call Helper with Retry ───

async function callGemini(prompt: string, label: string): Promise<unknown> {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: MODEL,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { temperature: 0.3, maxOutputTokens: MAX_TOKENS },
            });

            const text = response.text?.trim() || '';
            const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
            const parsed = JSON.parse(jsonStr);
            console.log(`[Report] Gemini ${label}: OK (attempt ${attempt})`);
            return parsed;
        } catch (err) {
            console.error(`[Report] Gemini ${label} attempt ${attempt}/${MAX_RETRIES} failed:`, err instanceof Error ? err.message : err);
            if (attempt === MAX_RETRIES) return null;
        }
    }
    return null;
}

// ─── Data-Driven Fallback ───

function fallbackOutput(analysis: ReportAnalysis, period: ReportPeriod): GeminiReportOutput {
  const kpi = analysis.kpis;
  const periodLabel = period.type === 'weekly' ? 'week' : 'month';
  const isGscOnly = !analysis.hasGa4;

    let healthStatus: GeminiReportOutput['executiveSummary']['healthStatus'] = 'stable';
    if (kpi.clicksDelta > 10 && kpi.sessionsDelta > 5) healthStatus = 'growing';
    else if (kpi.clicksDelta < -20 || kpi.impressionsDelta < -30) healthStatus = 'declining';
    else if (kpi.clicksDelta < -5 || kpi.avgPositionDelta > 2 || kpi.clicks < 10) healthStatus = 'at_risk';

  const highlights: string[] = [];
  if (kpi.clicksDelta !== 0) highlights.push(`Organic clicks ${kpi.clicksDelta >= 0 ? 'up' : 'down'} ${Math.abs(kpi.clicksDelta)}% (${kpi.clicks} total)`);
  if (kpi.impressionsDelta !== 0) highlights.push(`Impressions ${kpi.impressionsDelta >= 0 ? 'up' : 'down'} ${Math.abs(kpi.impressionsDelta)}% (${kpi.impressions} total)`);
  if (isGscOnly) {
    highlights.push('This PDF uses Search Console data only because GA4 is not connected for this user');
  } else {
    highlights.push(`${kpi.users.toLocaleString()} users, ${kpi.sessions.toLocaleString()} sessions this ${periodLabel}`);
    if (kpi.clicks < 10 && kpi.sessions > 100) highlights.push(`Only ${kpi.clicks} organic click(s) despite ${kpi.sessions.toLocaleString()} sessions — organic visibility is critically low`);
    if (kpi.newUserRatio >= 85) highlights.push(`${kpi.newUserRatio}% new user ratio — almost no returning visitors`);
  }

  const narrative = isGscOnly
      ? analysis.criticalAlerts.length > 0
          ? `This ${periodLabel}, the report uses Search Console data only because GA4 is not connected. Organic performance shows ${kpi.clicks.toLocaleString()} click(s) (${kpi.clicksDelta > 0 ? '+' : ''}${kpi.clicksDelta}%) from ${kpi.impressions.toLocaleString()} impressions (${kpi.impressionsDelta > 0 ? '+' : ''}${kpi.impressionsDelta}%). Average position is ${kpi.avgPosition}. ${analysis.criticalAlerts[0].detail} Focus on search visibility, indexing, and page-level keyword performance until GA4 is connected.`
          : `This ${periodLabel}, the report uses Search Console data only because GA4 is not connected. Organic search delivered ${kpi.clicks.toLocaleString()} click(s) (${kpi.clicksDelta > 0 ? '+' : ''}${kpi.clicksDelta}%) from ${kpi.impressions.toLocaleString()} impressions (${kpi.impressionsDelta > 0 ? '+' : ''}${kpi.impressionsDelta}%). Average position is ${kpi.avgPosition}. The clearest next steps come from keyword movement, page performance, and search visibility trends.`
      : analysis.criticalAlerts.length > 0
          ? `This ${periodLabel}, ${kpi.users.toLocaleString()} users visited with ${kpi.sessions.toLocaleString()} sessions, but the organic performance is alarming: only ${kpi.clicks} organic click(s) (${kpi.clicksDelta > 0 ? '+' : ''}${kpi.clicksDelta}%) from ${kpi.impressions} impressions. ${analysis.criticalAlerts[0].detail} Average position is ${kpi.avgPosition} with a ${(kpi.bounceRate * 100).toFixed(0)}% bounce rate. Immediate action is needed to address the organic visibility crisis.`
          : `This ${periodLabel}, ${kpi.users.toLocaleString()} users visited (${kpi.usersDelta > 0 ? '+' : ''}${kpi.usersDelta}%) with ${kpi.clicks.toLocaleString()} organic clicks (${kpi.clicksDelta > 0 ? '+' : ''}${kpi.clicksDelta}%). Average position: ${kpi.avgPosition}. Bounce rate: ${(kpi.bounceRate * 100).toFixed(1)}%.`;

    const criticalProblems = analysis.criticalAlerts.map(a => ({
        title: a.title,
        explanation: a.detail,
        fix: a.severity === 'critical'
            ? '1. Check Google Search Console for manual actions or security issues. 2. Verify all important pages are indexed (site:yourdomain.com). 3. Review recent changes to the site that might have caused ranking loss. 4. Check for technical SEO issues (robots.txt, canonical tags, redirects).'
            : '1. Review the affected pages and keywords. 2. Update content to match current search intent. 3. Improve internal linking to the affected pages.',
    }));

    return {
      executiveSummary: { healthStatus, narrative, highlights, oneAction: analysis.criticalAlerts.length > 0 ? `Address: ${analysis.criticalAlerts[0].title}` : 'Focus on the top declining keywords and refresh their landing pages.', oneActionWhy: analysis.criticalAlerts.length > 0 ? analysis.criticalAlerts[0].detail : 'Recovering declining keywords is faster than ranking for new ones.', oneActionImpact: `Could recover ${Math.abs(analysis.keywordVelocity.decelerating.reduce((s, k) => s + k.clickDelta, 0))} lost clicks.` },
      anomalyExplanations: analysis.anomalies.map(a => ({ date: a.date, rootCause: `Sessions were ${a.deviationPercent > 0 ? 'higher' : 'lower'} than expected (${a.actual} vs ~${a.expected}). This ${a.severity} anomaly represents a ${Math.abs(a.deviationPercent)}% deviation from the mean.`, impact: `${Math.abs(a.actual - a.expected)} sessions ${a.deviationPercent > 0 ? 'gained' : 'lost'} on ${a.dayName}.`, howToFix: a.deviationPercent < 0 ? '1. Check for technical issues or server downtime. 2. Review if any pages lost rankings on this day. 3. Verify no crawl errors in Search Console.' : '1. Identify the traffic source driving the spike. 2. Analyze which pages received extra traffic. 3. Create more content on similar topics.' })),
        trafficDNAInterpretation: isGscOnly
            ? 'Traffic composition is unavailable because GA4 is not connected for this user. This report focuses on Search Console signals such as impressions, clicks, average position, page-level decay, and keyword opportunities until GA4 is connected.'
            : `Your top channel is ${analysis.trafficDNA.channels[0]?.channel || 'Direct'} at ${analysis.trafficDNA.channels[0]?.currentShare || 0}% of traffic. ${analysis.trafficDNA.devices[0]?.device || 'Desktop'} leads device usage at ${analysis.trafficDNA.devices[0]?.currentShare || 0}%. ${kpi.clicks < 10 && kpi.sessions > 100 ? `The massive disconnect between ${kpi.sessions.toLocaleString()} GA4 sessions and only ${kpi.clicks} organic clicks indicates the site relies almost entirely on non-organic traffic sources. Building organic visibility should be the primary strategic objective.` : ''}`,
        criticalProblems,
        keywordAccelCommentary: analysis.keywordVelocity.accelerating.length > 0 ? `${analysis.keywordVelocity.accelerating.length} keywords gaining momentum.` : `No keywords showed acceleration. ${analysis.keywordVelocity.newKeywords.length > 0 ? `However, ${analysis.keywordVelocity.newKeywords.length} new keyword(s) appeared this period.` : 'The site needs to build keyword authority through new content and optimization.'}`,
        keywordDecelCommentary: analysis.keywordVelocity.decelerating.length > 0 ? `${analysis.keywordVelocity.decelerating.length} keywords losing momentum — requires attention.` : `No keywords showed deceleration. ${analysis.keywordVelocity.lostKeywords.length > 0 ? `However, ${analysis.keywordVelocity.lostKeywords.length} keyword(s) disappeared entirely.` : ''}`,
        keywordFixes: analysis.keywordVelocity.decelerating.slice(0, 5).map(k => ({ keyword: k.query, diagnosis: `Position dropped from ${k.prevPosition} to ${k.currentPosition}. Clicks fell by ${Math.abs(k.clickDelta)}.`, fixSteps: `1. Refresh content targeting "${k.query}". 2. Add internal links from high-authority pages. 3. Update title and meta description for better CTR.` })),
        decayOverview: analysis.decayPages.length > 0 ? `${analysis.decayPages.length} page(s) showing declining traffic and worsening positions.` : kpi.clicks < 10 ? `No decay detected because organic data is too sparse (${kpi.clicks} total clicks). Building organic visibility is the prerequisite.` : 'No significant content decay detected this period.',
        decayFixes: analysis.decayPages.slice(0, 3).map(p => ({ page: p.page, diagnosis: `Clicks dropped by ${Math.abs(p.clickDelta)} (${p.decayRate}% decline). Position worsened from ${p.prevPosition} to ${p.currentPosition}.`, refreshStrategy: `1. Update content with fresh data. 2. Improve heading structure. 3. Add new sections addressing recent search trends.` })),
        cannibalizationOverview: analysis.cannibalization.length > 0 ? `${analysis.cannibalization.length} keyword(s) have competing pages.` : 'No cannibalization detected.',
        cannibalizationFixes: analysis.cannibalization.slice(0, 3).map(c => ({ query: c.query, recommendation: `Keep ${c.winner} as the primary page.`, steps: `1. Consolidate thin competing pages. 2. Set up 301 redirects for removed pages. 3. Add canonical tags if pages serve different intents.` })),
        opportunityOverview: analysis.opportunities.length > 0 ? `${analysis.opportunities.length} opportunities worth ~$${analysis.totalRevenueEstimate}/month.` : kpi.impressions < 50 ? `No keyword opportunities detected — the site has only ${kpi.impressions} impressions. Priority is building any organic presence first.` : 'No actionable keyword opportunities found this period.',
        opportunityStrategies: analysis.opportunities.slice(0, 5).map(o => ({ keyword: o.query, strategy: `Position ${o.position.toFixed(1)} with ${o.impressions} impressions. Optimizing could capture ${o.potentialClicks} additional clicks.`, timeline: '2-4 weeks for initial results.' })),
        revenueNarrative: `Estimated monthly organic value: $${analysis.totalRevenueEstimate}. ${analysis.opportunities.length === 0 && kpi.clicks < 10 ? 'The site currently has negligible organic value. Building organic visibility through content creation and technical SEO is the foundation for revenue growth.' : 'Based on keyword positions and estimated CPC values.'}`,
        actionPlanThisWeek: analysis.criticalAlerts.length > 0
            ? [{ action: `Investigate and address: ${analysis.criticalAlerts[0].title}`, effort: 'medium' as const, impact: 'high' as const }, { action: 'Verify all important pages are indexed in Google Search Console', effort: 'low' as const, impact: 'high' as const }, { action: 'Check for crawl errors and fix any 404s or server errors', effort: 'low' as const, impact: 'medium' as const }]
            : [{ action: 'Refresh top 3 decaying pages', effort: 'medium' as const, impact: 'high' as const }, { action: 'Fix meta descriptions for CTR underperformers', effort: 'low' as const, impact: 'medium' as const }, { action: 'Add internal links to striking distance keywords', effort: 'low' as const, impact: 'medium' as const }],
        actionPlanThisMonth: [{ action: analysis.criticalAlerts.length > 0 ? 'Build a content strategy targeting 10+ relevant keywords' : 'Resolve keyword cannibalization (top 3 groups)', effort: 'high' as const, impact: 'high' as const }, { action: 'Create content targeting top 5 keyword opportunities', effort: 'high' as const, impact: 'high' as const }, { action: 'Build internal linking structure across all key pages', effort: 'medium' as const, impact: 'medium' as const }],
        pageOptimizations: analysis.pageGrades.filter(p => p.grade === 'D' || p.grade === 'F').slice(0, 3).map(p => ({ page: p.page, issues: `Grade ${p.grade}: position ${p.position}, CTR ${p.ctr}%${p.bounceRate === null ? ', GA4 behavior metrics unavailable.' : `, bounce ${p.bounceRate}%.`}`, fixes: `1. Rewrite title tag for better CTR. 2. Improve content depth. 3. Add structured data.` })),
    };
}

// ─── Main Synthesis ───

export async function synthesizeWithGemini(
    analysis: ReportAnalysis,
    period: ReportPeriod,
    siteUrl: string,
    rawData: ReportRawData
): Promise<GeminiReportOutput> {
    if (!GEMINI_API_KEY) {
        console.warn('[Report] No GEMINI_API_KEY — using data-driven fallback');
        return fallbackOutput(analysis, period);
    }

    try {
        const prompt1 = buildPrompt1(analysis, period, siteUrl, rawData);
        const prompt2 = buildPrompt2(analysis, period, siteUrl, rawData);

        const [raw1, raw2] = await Promise.all([
            callGemini(prompt1, 'diagnosis'),
            callGemini(prompt2, 'action-plan'),
        ]);

        const call1 = validateCall1(raw1 ?? {});
        const call2 = validateCall2(raw2 ?? {});

        // If Gemini returned empty narratives, merge with fallback data
        const fb = (call1.executiveSummary.narrative.length === 0 || call2.actionPlanThisWeek.length === 0)
            ? fallbackOutput(analysis, period) : null;

        return {
            executiveSummary: call1.executiveSummary.narrative.length > 0 ? call1.executiveSummary : (fb?.executiveSummary ?? call1.executiveSummary),
            anomalyExplanations: call1.anomalyExplanations.length > 0 ? call1.anomalyExplanations : (fb?.anomalyExplanations ?? []),
            trafficDNAInterpretation: call1.trafficDNAInterpretation.length > 0 ? call1.trafficDNAInterpretation : (fb?.trafficDNAInterpretation ?? ''),
            criticalProblems: call1.criticalProblems.length > 0 ? call1.criticalProblems : (fb?.criticalProblems ?? []),
            keywordAccelCommentary: call2.keywordAccelCommentary || fb?.keywordAccelCommentary || '',
            keywordDecelCommentary: call2.keywordDecelCommentary || fb?.keywordDecelCommentary || '',
            keywordFixes: call2.keywordFixes.length > 0 ? call2.keywordFixes : (fb?.keywordFixes ?? []),
            decayOverview: call2.decayOverview || fb?.decayOverview || '',
            decayFixes: call2.decayFixes.length > 0 ? call2.decayFixes : (fb?.decayFixes ?? []),
            cannibalizationOverview: call2.cannibalizationOverview || fb?.cannibalizationOverview || '',
            cannibalizationFixes: call2.cannibalizationFixes.length > 0 ? call2.cannibalizationFixes : (fb?.cannibalizationFixes ?? []),
            opportunityOverview: call2.opportunityOverview || fb?.opportunityOverview || '',
            opportunityStrategies: call2.opportunityStrategies.length > 0 ? call2.opportunityStrategies : (fb?.opportunityStrategies ?? []),
            revenueNarrative: call2.revenueNarrative || fb?.revenueNarrative || '',
            actionPlanThisWeek: call2.actionPlanThisWeek.length > 0 ? call2.actionPlanThisWeek : (fb?.actionPlanThisWeek ?? []),
            actionPlanThisMonth: call2.actionPlanThisMonth.length > 0 ? call2.actionPlanThisMonth : (fb?.actionPlanThisMonth ?? []),
            pageOptimizations: call2.pageOptimizations.length > 0 ? call2.pageOptimizations : (fb?.pageOptimizations ?? []),
        };
    } catch (err) {
        console.error('[Report] Gemini synthesis failed, using fallback:', err);
        return fallbackOutput(analysis, period);
    }
}

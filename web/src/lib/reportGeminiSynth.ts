/**
 * Gemini Synthesis — sends structured analysis data to Gemini via
 * 3 parallel focused calls and returns typed JSON for the PDF template.
 *
 * Call 1: Executive summary + anomaly root cause + traffic DNA
 * Call 2: Keyword analysis + content decay + cannibalization
 * Call 3: Opportunities + action plan + page optimizations
 */

import { GoogleGenAI } from '@google/genai';
import type { ReportAnalysis } from './reportAnalysis';
import type { ReportPeriod } from './reportDataFetcher';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

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

    // Call 3
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

// ─── Prompt Builders ───

function buildPrompt1(analysis: ReportAnalysis, period: ReportPeriod, siteUrl: string): string {
    const periodLabel = period.type === 'weekly' ? 'week' : 'month';
    const dateRange = `${period.startDate} to ${period.endDate}`;
    const kpi = analysis.kpis;
    const anomalies = analysis.anomalies;
    const dna = analysis.trafficDNA;

    return `You are a senior SEO analyst writing a ${periodLabel}ly analytics briefing for ${siteUrl}.
Period: ${dateRange} vs prior ${periodLabel} (${period.prevStartDate} to ${period.prevEndDate}).

CRITICAL: Be specific with real numbers. Give VERDICTS and ROOT CAUSES, not generic advice. Explain WHY things happened with evidence from the data.

## KPIs
- Users: ${kpi.users} (${kpi.usersDelta > 0 ? '+' : ''}${kpi.usersDelta}%)
- Sessions: ${kpi.sessions} (${kpi.sessionsDelta > 0 ? '+' : ''}${kpi.sessionsDelta}%)
- Organic Clicks: ${kpi.clicks} (${kpi.clicksDelta > 0 ? '+' : ''}${kpi.clicksDelta}%)
- Impressions: ${kpi.impressions} (${kpi.impressionsDelta > 0 ? '+' : ''}${kpi.impressionsDelta}%)
- Avg Position: ${kpi.avgPosition} (${kpi.avgPositionDelta > 0 ? '+' : ''}${kpi.avgPositionDelta})
- Bounce Rate: ${(kpi.bounceRate * 100).toFixed(1)}% (${kpi.bounceRateDelta > 0 ? '+' : ''}${(kpi.bounceRateDelta * 100).toFixed(1)}pp)
- New User Ratio: ${kpi.newUserRatio}%
- Avg Session Duration: ${kpi.avgSessionDuration}s

## Anomaly Days
${anomalies.length === 0 ? 'No significant anomalies.' : anomalies.map(a =>
        `- ${a.dayName} ${a.date}: ${a.actual} sessions vs ~${a.expected} expected (${a.deviationPercent > 0 ? '+' : ''}${a.deviationPercent}%, ${a.severity})${a.topQueryShifts.length > 0 ? ` — organic clicks also shifted by ${a.topQueryShifts[0].clickDelta}` : ''}`
    ).join('\n')}

## Traffic DNA
- Channels: ${dna.channels.slice(0, 5).map(c => `${c.channel} ${c.currentShare}% (${c.shareDelta > 0 ? '+' : ''}${c.shareDelta}pp)`).join(', ')}
- Devices: ${dna.devices.map(d => `${d.device} ${d.currentShare}% (${d.shareDelta > 0 ? '+' : ''}${d.shareDelta}pp)`).join(', ')}
- Countries: ${dna.countries.map(c => `${c.country} ${c.currentShare}% (${c.shareDelta > 0 ? '+' : ''}${c.shareDelta}pp)`).join(', ')}
- Top page: ${dna.topPage} drives ${dna.topPageShare}% of sessions
- New user ratio: ${dna.newUserRatio}%

## OUTPUT (valid JSON only, no markdown):
{
  "executiveSummary": {
    "healthStatus": "growing|stable|at_risk|declining",
    "narrative": "4-6 sentence detailed executive summary with specific numbers, trends, and verdict",
    "highlights": ["highlight with number 1", "highlight with number 2", "highlight 3", "highlight 4"],
    "oneAction": "The single highest-impact action (specific, not generic)",
    "oneActionWhy": "Why this matters with data evidence (2-3 sentences)",
    "oneActionImpact": "Specific expected result (e.g. 'Could recover 200+ organic clicks/week')"
  },
  "anomalyExplanations": [${anomalies.map(() => `{
      "date": "YYYY-MM-DD",
      "rootCause": "Detailed root cause analysis (3-4 sentences) explaining WHY with evidence",
      "impact": "Precise traffic impact with numbers",
      "howToFix": "3 specific actionable steps to fix or capitalize on this"
    }`).join(',')}],
  "trafficDNAInterpretation": "5-6 sentence deep analysis of traffic composition shifts, what they mean for the business, and any red flags or opportunities"
}`;
}

function buildPrompt2(analysis: ReportAnalysis, period: ReportPeriod, siteUrl: string): string {
    const periodLabel = period.type === 'weekly' ? 'week' : 'month';
    const accel = analysis.keywordVelocity.accelerating;
    const decel = analysis.keywordVelocity.decelerating;
    const decay = analysis.decayPages;
    const cannibal = analysis.cannibalization;

    return `You are a senior SEO strategist analyzing keyword performance and content issues for ${siteUrl}.
Period: ${period.startDate} to ${period.endDate} (${periodLabel}ly report).

CRITICAL: Give SPECIFIC, ACTIONABLE advice per keyword/page. Include real numbers. No generic tips.

## Accelerating Keywords
${accel.length === 0 ? 'None' : accel.map(k =>
        `- "${k.query}": pos ${k.prevPosition}->${k.currentPosition}, clicks ${k.prevClicks}->${k.currentClicks}, CTR ${k.actualCtr}% (expected ${k.expectedCtr}%), gap ${k.ctrGap}pp`
    ).join('\n')}

## Decelerating Keywords
${decel.length === 0 ? 'None' : decel.map(k =>
        `- "${k.query}": pos ${k.prevPosition}->${k.currentPosition}, clicks ${k.prevClicks}->${k.currentClicks}, CTR ${k.actualCtr}% (expected ${k.expectedCtr}%), gap ${k.ctrGap}pp`
    ).join('\n')}

## Content Decay (${decay.length} pages)
${decay.length === 0 ? 'No decay.' : decay.slice(0, 5).map(p =>
        `- ${p.page}: clicks ${p.prevClicks}->${p.currentClicks} (${p.decayRate}%), pos ${p.prevPosition}->${p.currentPosition}, CTR ${p.currentCtr}%`
    ).join('\n')}

## Cannibalization (${cannibal.length} groups)
${cannibal.length === 0 ? 'None.' : cannibal.slice(0, 5).map(c =>
        `- "${c.query}" (${c.totalImpressions} impr): ${c.pages.map(p => `${p.page} [${p.clicks}cl, pos ${p.position}]`).join(' vs ')}`
    ).join('\n')}

## OUTPUT (valid JSON only, no markdown):
{
  "keywordAccelCommentary": "3-4 sentences analyzing accelerating keywords as a group — what trend they indicate, business opportunity",
  "keywordDecelCommentary": "3-4 sentences analyzing decelerating keywords — what's happening, severity, and urgency",
  "keywordFixes": [${decel.slice(0, 5).map(k => `{
      "keyword": "${k.query.replace(/"/g, '\\"')}",
      "diagnosis": "2-3 sentences: why this keyword is declining",
      "fixSteps": "3-4 numbered specific steps to recover this keyword"
    }`).join(',')}],
  "decayOverview": "3-4 sentences: overall assessment of content health, how many pages affected, urgency level",
  "decayFixes": [${decay.slice(0, 3).map(p => `{
      "page": "${p.page.replace(/"/g, '\\"')}",
      "diagnosis": "2-3 sentences: why this page is decaying",
      "refreshStrategy": "3-4 numbered steps to refresh this specific page"
    }`).join(',')}],
  "cannibalizationOverview": "3-4 sentences: how severe the cannibalization is, impact on rankings",
  "cannibalizationFixes": [${cannibal.slice(0, 3).map(c => `{
      "query": "${c.query.replace(/"/g, '\\"')}",
      "recommendation": "Which page should win and why (2 sentences)",
      "steps": "3-4 numbered steps to resolve (merge, redirect, differentiate)"
    }`).join(',')}]
}`;
}

function buildPrompt3(analysis: ReportAnalysis, period: ReportPeriod, siteUrl: string): string {
    const periodLabel = period.type === 'weekly' ? 'week' : 'month';
    const opps = analysis.opportunities;
    const pages = analysis.pageGrades;

    return `You are a senior SEO strategist creating an action plan for ${siteUrl}.
Period: ${period.startDate} to ${period.endDate} (${periodLabel}ly report).

CRITICAL: Every action must be SPECIFIC and ACTIONABLE with expected results.

## Top Opportunities (${opps.length} found)
${opps.slice(0, 8).map(o =>
        `- "${o.query}" pos ${o.position.toFixed(1)}, ${o.impressions} impr, potential +${o.potentialClicks} clicks (~$${o.revenueEstimate}/mo), type: ${o.type}`
    ).join('\n')}

Total estimated monthly value: $${analysis.totalRevenueEstimate}

## Pages Needing Optimization
${pages.filter(p => p.grade === 'D' || p.grade === 'F').slice(0, 5).map(p =>
        `- ${p.page}: grade ${p.grade}, pos ${p.position}, CTR ${p.ctr}%, ${p.clicks} clicks, bounce ${p.bounceRate}%`
    ).join('\n') || 'All pages graded C or above.'}

## Key Metrics
- Total organic clicks: ${analysis.kpis.clicks} (${analysis.kpis.clicksDelta > 0 ? '+' : ''}${analysis.kpis.clicksDelta}%)
- Decay pages: ${analysis.decayPages.length}
- Cannibalization groups: ${analysis.cannibalization.length}
- Fix prompts generated: ${analysis.fixPrompts.length}

## OUTPUT (valid JSON only, no markdown):
{
  "opportunityOverview": "3-4 sentences: overall opportunity landscape, total value, urgency",
  "opportunityStrategies": [${opps.slice(0, 5).map(o => `{
      "keyword": "${o.query.replace(/"/g, '\\"')}",
      "strategy": "3-4 sentences: specific steps to capture this opportunity",
      "timeline": "Realistic timeline (e.g. '2-3 weeks for initial impact')"
    }`).join(',')}],
  "revenueNarrative": "3-4 sentences: explain the revenue methodology and total opportunity value",
  "actionPlanThisWeek": [
    {"action": "Specific action 1 with expected result", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Specific action 2", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Specific action 3", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Specific action 4", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Specific action 5", "effort": "low|medium|high", "impact": "low|medium|high"}
  ],
  "actionPlanThisMonth": [
    {"action": "Specific longer-term action 1", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Specific longer-term action 2", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Specific longer-term action 3", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Specific longer-term action 4", "effort": "low|medium|high", "impact": "low|medium|high"},
    {"action": "Specific longer-term action 5", "effort": "low|medium|high", "impact": "low|medium|high"}
  ],
  "pageOptimizations": [${pages.filter(p => p.grade === 'D' || p.grade === 'F' || p.grade === 'C').slice(0, 3).map(p => `{
      "page": "${p.page.replace(/"/g, '\\"')}",
      "issues": "2-3 sentences: what's wrong with this page (specific metrics)",
      "fixes": "3-4 numbered specific optimization steps"
    }`).join(',')}]
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

function validateCall1(raw: unknown): Pick<GeminiReportOutput, 'executiveSummary' | 'anomalyExplanations' | 'trafficDNAInterpretation'> {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const es = (obj.executiveSummary && typeof obj.executiveSummary === 'object' ? obj.executiveSummary : {}) as Record<string, unknown>;

    const validStatuses = new Set(['growing', 'stable', 'at_risk', 'declining']);
    const healthStatus = validStatuses.has(es.healthStatus as string)
        ? (es.healthStatus as GeminiReportOutput['executiveSummary']['healthStatus'])
        : 'stable';

    return {
        executiveSummary: {
            healthStatus,
            narrative: str(es.narrative, 'Report analyzed but narrative incomplete.'),
            highlights: strArr(es.highlights, ['Data analyzed', 'See metrics below']),
            oneAction: str(es.oneAction, 'Review your top-performing pages.'),
            oneActionWhy: str(es.oneActionWhy, 'Maintaining top content keeps organic traffic stable.'),
            oneActionImpact: str(es.oneActionImpact, 'Potential improvement in organic visibility.'),
        },
        anomalyExplanations: Array.isArray(obj.anomalyExplanations)
            ? obj.anomalyExplanations.map((a: Record<string, unknown>) => ({
                date: str(a?.date, ''),
                rootCause: str(a?.rootCause, 'Unable to determine root cause.'),
                impact: str(a?.impact, 'Unknown impact.'),
                howToFix: str(a?.howToFix, 'Review the data manually for this date.'),
            }))
            : [],
        trafficDNAInterpretation: str(obj.trafficDNAInterpretation as string, 'Traffic composition data was analyzed.'),
    };
}

function validateCall2(raw: unknown): Pick<GeminiReportOutput, 'keywordAccelCommentary' | 'keywordDecelCommentary' | 'keywordFixes' | 'decayOverview' | 'decayFixes' | 'cannibalizationOverview' | 'cannibalizationFixes'> {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

    return {
        keywordAccelCommentary: str(obj.keywordAccelCommentary, 'No accelerating keyword commentary available.'),
        keywordDecelCommentary: str(obj.keywordDecelCommentary, 'No decelerating keyword commentary available.'),
        keywordFixes: Array.isArray(obj.keywordFixes)
            ? obj.keywordFixes.map((f: Record<string, unknown>) => ({
                keyword: str(f?.keyword, ''),
                diagnosis: str(f?.diagnosis, 'Analysis pending.'),
                fixSteps: str(f?.fixSteps, 'Update content and optimize on-page elements.'),
            }))
            : [],
        decayOverview: str(obj.decayOverview, 'Content decay analysis complete.'),
        decayFixes: Array.isArray(obj.decayFixes)
            ? obj.decayFixes.map((f: Record<string, unknown>) => ({
                page: str(f?.page, ''),
                diagnosis: str(f?.diagnosis, 'Analysis pending.'),
                refreshStrategy: str(f?.refreshStrategy, 'Refresh content and update meta tags.'),
            }))
            : [],
        cannibalizationOverview: str(obj.cannibalizationOverview, 'Cannibalization analysis complete.'),
        cannibalizationFixes: Array.isArray(obj.cannibalizationFixes)
            ? obj.cannibalizationFixes.map((f: Record<string, unknown>) => ({
                query: str(f?.query, ''),
                recommendation: str(f?.recommendation, 'Consolidate competing pages.'),
                steps: str(f?.steps, 'Merge content and set up 301 redirects.'),
            }))
            : [],
    };
}

function validateCall3(raw: unknown): Pick<GeminiReportOutput, 'opportunityOverview' | 'opportunityStrategies' | 'revenueNarrative' | 'actionPlanThisWeek' | 'actionPlanThisMonth' | 'pageOptimizations'> {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

    return {
        opportunityOverview: str(obj.opportunityOverview, 'Opportunity analysis complete.'),
        opportunityStrategies: Array.isArray(obj.opportunityStrategies)
            ? obj.opportunityStrategies.map((s: Record<string, unknown>) => ({
                keyword: str(s?.keyword, ''),
                strategy: str(s?.strategy, 'Optimize content targeting this keyword.'),
                timeline: str(s?.timeline, '2-4 weeks'),
            }))
            : [],
        revenueNarrative: str(obj.revenueNarrative, 'Revenue estimate based on keyword opportunity analysis.'),
        actionPlanThisWeek: Array.isArray(obj.actionPlanThisWeek)
            ? obj.actionPlanThisWeek.map((a: Record<string, unknown>) => ({
                action: str(a?.action, 'Review top pages.'),
                effort: validEI(a?.effort),
                impact: validEI(a?.impact),
            }))
            : [{ action: 'Review and refresh top decaying content.', effort: 'medium' as const, impact: 'high' as const }],
        actionPlanThisMonth: Array.isArray(obj.actionPlanThisMonth)
            ? obj.actionPlanThisMonth.map((a: Record<string, unknown>) => ({
                action: str(a?.action, 'Implement content strategy.'),
                effort: validEI(a?.effort),
                impact: validEI(a?.impact),
            }))
            : [{ action: 'Build internal linking structure.', effort: 'high' as const, impact: 'high' as const }],
        pageOptimizations: Array.isArray(obj.pageOptimizations)
            ? obj.pageOptimizations.map((p: Record<string, unknown>) => ({
                page: str(p?.page, ''),
                issues: str(p?.issues, 'Page needs optimization.'),
                fixes: str(p?.fixes, 'Improve content and meta tags.'),
            }))
            : [],
    };
}

// ─── Gemini Call Helper ───

async function callGemini(prompt: string): Promise<unknown> {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            temperature: 0.3,
            maxOutputTokens: 4096,
        },
    });

    const text = response.text?.trim() || '';
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(jsonStr);
}

// ─── Main Synthesis ───

export async function synthesizeWithGemini(
    analysis: ReportAnalysis,
    period: ReportPeriod,
    siteUrl: string
): Promise<GeminiReportOutput> {
    if (!GEMINI_API_KEY) {
        return fallbackOutput(analysis, period);
    }

    try {
        const prompt1 = buildPrompt1(analysis, period, siteUrl);
        const prompt2 = buildPrompt2(analysis, period, siteUrl);
        const prompt3 = buildPrompt3(analysis, period, siteUrl);

        const [raw1, raw2, raw3] = await Promise.all([
            callGemini(prompt1).catch(err => { console.error('[Report] Gemini call 1 failed:', err); return null; }),
            callGemini(prompt2).catch(err => { console.error('[Report] Gemini call 2 failed:', err); return null; }),
            callGemini(prompt3).catch(err => { console.error('[Report] Gemini call 3 failed:', err); return null; }),
        ]);

        const call1 = raw1 ? validateCall1(raw1) : validateCall1({});
        const call2 = raw2 ? validateCall2(raw2) : validateCall2({});
        const call3 = raw3 ? validateCall3(raw3) : validateCall3({});

        return { ...call1, ...call2, ...call3 };
    } catch (err) {
        console.error('[Report] Gemini synthesis failed, using fallback:', err);
        return fallbackOutput(analysis, period);
    }
}

function fallbackOutput(analysis: ReportAnalysis, period: ReportPeriod): GeminiReportOutput {
    const kpi = analysis.kpis;
    const periodLabel = period.type === 'weekly' ? 'week' : 'month';

    let healthStatus: GeminiReportOutput['executiveSummary']['healthStatus'] = 'stable';
    if (kpi.clicksDelta > 10 && kpi.sessionsDelta > 5) healthStatus = 'growing';
    else if (kpi.clicksDelta < -15 || kpi.sessionsDelta < -15) healthStatus = 'declining';
    else if (kpi.clicksDelta < -5 || kpi.avgPositionDelta > 2) healthStatus = 'at_risk';

    return {
        executiveSummary: {
            healthStatus,
            narrative: `This ${periodLabel}, ${kpi.users.toLocaleString()} users visited (${kpi.usersDelta > 0 ? '+' : ''}${kpi.usersDelta}%) with ${kpi.clicks.toLocaleString()} organic clicks (${kpi.clicksDelta > 0 ? '+' : ''}${kpi.clicksDelta}%). Average position: ${kpi.avgPosition}. Bounce rate: ${(kpi.bounceRate * 100).toFixed(1)}%.`,
            highlights: [
                `Organic clicks ${kpi.clicksDelta >= 0 ? 'up' : 'down'} ${Math.abs(kpi.clicksDelta)}%`,
                `${kpi.users.toLocaleString()} total users this ${periodLabel}`,
                `Average position: ${kpi.avgPosition}`,
                `${kpi.newUserRatio}% new user ratio`,
            ],
            oneAction: 'Focus on the top declining keywords and refresh their landing pages.',
            oneActionWhy: 'Recovering declining keywords is faster than ranking for new ones.',
            oneActionImpact: `Could recover ${Math.abs(analysis.keywordVelocity.decelerating.reduce((s, k) => s + k.clickDelta, 0))} lost clicks.`,
        },
        anomalyExplanations: analysis.anomalies.map(a => ({
            date: a.date,
            rootCause: `Sessions were ${a.deviationPercent > 0 ? 'higher' : 'lower'} than expected (${a.actual} vs ~${a.expected}). This ${a.severity} anomaly represents a ${Math.abs(a.deviationPercent)}% deviation from the mean.`,
            impact: `${Math.abs(a.actual - a.expected)} sessions ${a.deviationPercent > 0 ? 'gained' : 'lost'} on ${a.dayName}.`,
            howToFix: a.deviationPercent < 0
                ? '1. Check for technical issues or server downtime. 2. Review if any pages lost rankings on this day. 3. Verify no crawl errors in Search Console.'
                : '1. Identify the traffic source driving the spike. 2. Analyze which pages received extra traffic. 3. Create more content on similar topics.',
        })),
        trafficDNAInterpretation: `Your top channel is ${analysis.trafficDNA.channels[0]?.channel || 'Organic Search'} at ${analysis.trafficDNA.channels[0]?.currentShare || 0}% of traffic. ${analysis.trafficDNA.devices[0]?.device || 'Desktop'} leads device usage at ${analysis.trafficDNA.devices[0]?.currentShare || 0}%.`,
        keywordAccelCommentary: analysis.keywordVelocity.accelerating.length > 0
            ? `${analysis.keywordVelocity.accelerating.length} keywords gaining momentum with improving positions.`
            : 'No keywords showed significant acceleration this period.',
        keywordDecelCommentary: analysis.keywordVelocity.decelerating.length > 0
            ? `${analysis.keywordVelocity.decelerating.length} keywords losing momentum — requires attention.`
            : 'No keywords showed significant deceleration.',
        keywordFixes: analysis.keywordVelocity.decelerating.slice(0, 5).map(k => ({
            keyword: k.query,
            diagnosis: `Position dropped from ${k.prevPosition} to ${k.currentPosition}. Clicks fell by ${Math.abs(k.clickDelta)}.`,
            fixSteps: `1. Refresh content targeting "${k.query}". 2. Add internal links from high-authority pages. 3. Update title and meta description for better CTR.`,
        })),
        decayOverview: `${analysis.decayPages.length} pages showing declining traffic and worsening positions.`,
        decayFixes: analysis.decayPages.slice(0, 3).map(p => ({
            page: p.page,
            diagnosis: `Clicks dropped by ${Math.abs(p.clickDelta)} (${p.decayRate}% decline). Position worsened from ${p.prevPosition} to ${p.currentPosition}.`,
            refreshStrategy: `1. Update content with fresh data. 2. Improve heading structure and readability. 3. Add new sections addressing recent search trends.`,
        })),
        cannibalizationOverview: `${analysis.cannibalization.length} keywords have multiple competing pages.`,
        cannibalizationFixes: analysis.cannibalization.slice(0, 3).map(c => ({
            query: c.query,
            recommendation: `Keep ${c.winner} as the primary page. It has the most clicks.`,
            steps: `1. Consolidate thin competing pages. 2. Set up 301 redirects for removed pages. 3. Add canonical tags if pages serve different intents.`,
        })),
        opportunityOverview: `${analysis.opportunities.length} opportunities worth ~$${analysis.totalRevenueEstimate}/month.`,
        opportunityStrategies: analysis.opportunities.slice(0, 5).map(o => ({
            keyword: o.query,
            strategy: `Currently at position ${o.position.toFixed(1)} with ${o.impressions} impressions. Optimizing could capture ${o.potentialClicks} additional clicks.`,
            timeline: '2-4 weeks for initial results.',
        })),
        revenueNarrative: `Based on current keyword positions and search volume, the estimated monthly organic value is $${analysis.totalRevenueEstimate}. This is calculated from potential click gains multiplied by estimated CPC for each keyword.`,
        actionPlanThisWeek: [
            { action: 'Refresh top 3 decaying pages', effort: 'medium' as const, impact: 'high' as const },
            { action: 'Fix meta descriptions for CTR underperformers', effort: 'low' as const, impact: 'medium' as const },
            { action: 'Add internal links to striking distance keywords', effort: 'low' as const, impact: 'medium' as const },
        ],
        actionPlanThisMonth: [
            { action: 'Resolve keyword cannibalization (top 3 groups)', effort: 'high' as const, impact: 'high' as const },
            { action: 'Create content targeting top 5 opportunities', effort: 'high' as const, impact: 'high' as const },
            { action: 'Build internal linking structure', effort: 'medium' as const, impact: 'medium' as const },
        ],
        pageOptimizations: analysis.pageGrades.filter(p => p.grade === 'D' || p.grade === 'F').slice(0, 3).map(p => ({
            page: p.page,
            issues: `Grade ${p.grade}: position ${p.position}, CTR ${p.ctr}%, bounce ${p.bounceRate}%.`,
            fixes: `1. Rewrite title tag for better CTR. 2. Improve content depth. 3. Add structured data.`,
        })),
    };
}

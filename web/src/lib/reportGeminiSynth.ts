/**
 * Gemini Synthesis — sends structured analysis data to Gemini and returns
 * typed JSON for populating the PDF template slots.
 *
 * Gemini NEVER controls layout — it only fills text content into fixed fields.
 */

import { GoogleGenAI } from '@google/genai';
import type { ReportAnalysis } from './reportAnalysis';
import type { ReportPeriod } from './reportDataFetcher';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ─── Output Types ───

export interface GeminiReportOutput {
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
    keywordInsights: {
        acceleratingCommentary: string;
        deceleratingCommentary: string;
        topDeceleratingFix: string;
    };
    trafficDNAInterpretation: string;
    lockedTeasers: {
        cannibalizationSummary: string;
        decaySummary: string;
        revenueEstimate: string;
        strategySummary: string;
        cwvSummary: string;
    };
}

// ─── Prompt Builder ───

function buildPrompt(analysis: ReportAnalysis, period: ReportPeriod, siteUrl: string): string {
    const periodLabel = period.type === 'weekly' ? 'week' : 'month';
    const dateRange = `${period.startDate} to ${period.endDate}`;

    const kpi = analysis.kpis;
    const anomalies = analysis.anomalies;
    const accel = analysis.keywordVelocity.accelerating;
    const decel = analysis.keywordVelocity.decelerating;
    const dna = analysis.trafficDNA;
    const decay = analysis.decayPages;
    const cannibal = analysis.cannibalization;
    const opps = analysis.opportunities;

    return `You are a senior SEO analyst writing a ${periodLabel}ly analytics briefing for the owner of ${siteUrl}.
Period: ${dateRange} vs prior ${periodLabel} (${period.prevStartDate} to ${period.prevEndDate}).

Be specific with numbers. Give verdicts, not generic advice. Explain WHY things happened, not just WHAT happened. Keep each field concise (2-4 sentences max per field unless noted).

## DATA

### KPIs
- Users: ${kpi.users} (${kpi.usersDelta > 0 ? '+' : ''}${kpi.usersDelta}%)
- Sessions: ${kpi.sessions} (${kpi.sessionsDelta > 0 ? '+' : ''}${kpi.sessionsDelta}%)
- Organic Clicks: ${kpi.clicks} (${kpi.clicksDelta > 0 ? '+' : ''}${kpi.clicksDelta}%)
- Impressions: ${kpi.impressions} (${kpi.impressionsDelta > 0 ? '+' : ''}${kpi.impressionsDelta}%)
- Avg Position: ${kpi.avgPosition} (${kpi.avgPositionDelta > 0 ? '+' : ''}${kpi.avgPositionDelta})
- Bounce Rate: ${(kpi.bounceRate * 100).toFixed(1)}% (${kpi.bounceRateDelta > 0 ? '+' : ''}${(kpi.bounceRateDelta * 100).toFixed(1)}pp)

### Anomaly Days
${anomalies.length === 0 ? 'No significant anomalies detected this period.' : anomalies.map(a =>
        `- ${a.dayName} ${a.date}: sessions ${a.actual} vs expected ~${a.expected} (${a.deviationPercent > 0 ? '+' : ''}${a.deviationPercent}%, severity: ${a.severity})`
    ).join('\n')}

### Top Accelerating Keywords
${accel.length === 0 ? 'None' : accel.map(k =>
        `- "${k.query}": pos ${k.prevPosition}→${k.currentPosition} (${k.positionDelta > 0 ? '+' : ''}${k.positionDelta}), clicks ${k.prevClicks}→${k.currentClicks}, impressions ${k.impressionDelta > 0 ? '+' : ''}${k.impressionDelta}%`
    ).join('\n')}

### Top Decelerating Keywords
${decel.length === 0 ? 'None' : decel.map(k =>
        `- "${k.query}": pos ${k.prevPosition}→${k.currentPosition} (${k.positionDelta > 0 ? '+' : ''}${k.positionDelta}), clicks ${k.prevClicks}→${k.currentClicks}, impressions ${k.impressionDelta > 0 ? '+' : ''}${k.impressionDelta}%`
    ).join('\n')}

### Traffic DNA
- Top channels: ${dna.channels.slice(0, 5).map(c => `${c.channel} ${c.currentShare}% (${c.shareDelta > 0 ? '+' : ''}${c.shareDelta}pp)`).join(', ')}
- Devices: ${dna.devices.map(d => `${d.device} ${d.currentShare}% (${d.shareDelta > 0 ? '+' : ''}${d.shareDelta}pp)`).join(', ')}
- Top countries: ${dna.countries.map(c => `${c.country} ${c.currentShare}% (${c.shareDelta > 0 ? '+' : ''}${c.shareDelta}pp)`).join(', ')}
- Top page: ${dna.topPage} drives ${dna.topPageShare}% of sessions
- New user ratio: ${dna.newUserRatio}%

### Content Decay
${decay.length === 0 ? 'No significant decay detected.' : `${decay.length} pages losing traffic: ${decay.slice(0, 3).map(p => `${p.page} (${p.clickDelta} clicks, position +${p.positionDelta})`).join(', ')}`}

### Cannibalization
${cannibal.length === 0 ? 'No cannibalization detected.' : `${cannibal.length} keywords have multiple competing pages: ${cannibal.slice(0, 3).map(c => `"${c.query}" (${c.pages.length} pages, ${c.totalImpressions} impressions)`).join(', ')}`}

### Opportunities
${opps.length === 0 ? 'No clear opportunities.' : `${opps.length} opportunities found: ${opps.slice(0, 5).map(o => `"${o.query}" pos ${o.position.toFixed(1)}, potential +${o.potentialClicks} clicks (${o.type})`).join(', ')}`}

## REQUIRED OUTPUT

Return ONLY valid JSON matching this exact schema (no markdown, no code fences):

{
  "executiveSummary": {
    "healthStatus": "growing" | "stable" | "at_risk" | "declining",
    "narrative": "2-4 sentence executive summary with specific numbers",
    "highlights": ["highlight 1", "highlight 2", "highlight 3"],
    "oneAction": "The single most impactful action to take this ${periodLabel}",
    "oneActionWhy": "Why this matters (1-2 sentences)",
    "oneActionImpact": "Expected impact if they do this (specific estimate)"
  },
  "anomalyExplanations": [
    {
      "date": "YYYY-MM-DD",
      "rootCause": "What caused this anomaly (2-3 sentences with analysis)",
      "impact": "Estimated traffic impact (specific number)",
      "howToFix": "Specific steps to fix or capitalize (2-3 actionable bullets)"
    }
  ],
  "keywordInsights": {
    "acceleratingCommentary": "What the accelerating keywords mean for the business (2-3 sentences)",
    "deceleratingCommentary": "What the decelerating keywords mean and what's happening (2-3 sentences)",
    "topDeceleratingFix": "Specific method to fix the top decelerating keyword (3-4 steps)"
  },
  "trafficDNAInterpretation": "What the traffic composition shifts mean for the business (3-4 sentences). Flag anything concerning.",
  "lockedTeasers": {
    "cannibalizationSummary": "One sentence about cannibalization findings",
    "decaySummary": "One sentence about content decay findings",
    "revenueEstimate": "Estimated monthly organic value (e.g. '$3,800/month')",
    "strategySummary": "One sentence about content strategy opportunities",
    "cwvSummary": "One sentence about technical performance"
  }
}`;
}

// ─── Validation ───

function str(v: unknown, fallback: string): string {
    return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function strArr(v: unknown, fallback: string[]): string[] {
    if (!Array.isArray(v)) return fallback;
    return v.map(item => (typeof item === 'string' ? item : String(item)));
}

function validateGeminiOutput(raw: unknown): GeminiReportOutput {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const es = (obj.executiveSummary && typeof obj.executiveSummary === 'object' ? obj.executiveSummary : {}) as Record<string, unknown>;

    const validStatuses = new Set(['growing', 'stable', 'at_risk', 'declining']);
    const healthStatus = validStatuses.has(es.healthStatus as string)
        ? (es.healthStatus as GeminiReportOutput['executiveSummary']['healthStatus'])
        : 'stable';

    const anomalyExplanations = Array.isArray(obj.anomalyExplanations)
        ? obj.anomalyExplanations.map((a: Record<string, unknown>) => ({
            date: str(a?.date, ''),
            rootCause: str(a?.rootCause, 'Unable to determine root cause.'),
            impact: str(a?.impact, 'Unknown impact.'),
            howToFix: str(a?.howToFix, 'Review the data manually for this date.'),
        }))
        : [];

    const ki = (obj.keywordInsights && typeof obj.keywordInsights === 'object' ? obj.keywordInsights : {}) as Record<string, unknown>;
    const lt = (obj.lockedTeasers && typeof obj.lockedTeasers === 'object' ? obj.lockedTeasers : {}) as Record<string, unknown>;

    return {
        executiveSummary: {
            healthStatus,
            narrative: str(es.narrative, 'Report data was analyzed but narrative generation was incomplete.'),
            highlights: strArr(es.highlights, ['Data analyzed', 'See metrics below']),
            oneAction: str(es.oneAction, 'Review your top-performing pages.'),
            oneActionWhy: str(es.oneActionWhy, 'Maintaining top content keeps organic traffic stable.'),
            oneActionImpact: str(es.oneActionImpact, 'Potential improvement in organic visibility.'),
        },
        anomalyExplanations,
        keywordInsights: {
            acceleratingCommentary: str(ki.acceleratingCommentary, 'No accelerating keyword commentary available.'),
            deceleratingCommentary: str(ki.deceleratingCommentary, 'No decelerating keyword commentary available.'),
            topDeceleratingFix: str(ki.topDeceleratingFix, 'Update content, add internal links, and refresh on-page elements.'),
        },
        trafficDNAInterpretation: str(obj.trafficDNAInterpretation as string, 'Traffic composition data was analyzed but interpretation was incomplete.'),
        lockedTeasers: {
            cannibalizationSummary: str(lt.cannibalizationSummary, 'Cannibalization analysis available on the dashboard.'),
            decaySummary: str(lt.decaySummary, 'Content decay analysis available on the dashboard.'),
            revenueEstimate: str(lt.revenueEstimate, 'Revenue estimate available on the dashboard.'),
            strategySummary: str(lt.strategySummary, 'Content strategy recommendations available on the dashboard.'),
            cwvSummary: str(lt.cwvSummary, 'Core Web Vitals audit available on the dashboard.'),
        },
    };
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

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const prompt = buildPrompt(analysis, period, siteUrl);

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0.3,
                maxOutputTokens: 2000,
            },
        });

        const text = response.text?.trim() || '';
        const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(jsonStr);
        return validateGeminiOutput(parsed);
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
            narrative: `This ${periodLabel}, your site had ${kpi.users.toLocaleString()} users (${kpi.usersDelta > 0 ? '+' : ''}${kpi.usersDelta}%) and ${kpi.clicks.toLocaleString()} organic clicks (${kpi.clicksDelta > 0 ? '+' : ''}${kpi.clicksDelta}%). Average position moved to ${kpi.avgPosition} (${kpi.avgPositionDelta > 0 ? '+' : ''}${kpi.avgPositionDelta}).`,
            highlights: [
                `Organic clicks ${kpi.clicksDelta >= 0 ? 'up' : 'down'} ${Math.abs(kpi.clicksDelta)}%`,
                `${kpi.users.toLocaleString()} total users this ${periodLabel}`,
                `Average position: ${kpi.avgPosition}`,
            ],
            oneAction: `Review your top performing pages and ensure meta descriptions are optimized.`,
            oneActionWhy: `Well-optimized meta descriptions improve CTR without changing rankings.`,
            oneActionImpact: `Could increase organic clicks by 10-20% on targeted pages.`,
        },
        anomalyExplanations: analysis.anomalies.map(a => ({
            date: a.date,
            rootCause: `Sessions were ${a.deviationPercent > 0 ? 'higher' : 'lower'} than expected (${a.actual} vs ~${a.expected}).`,
            impact: `${Math.abs(a.actual - a.expected)} sessions ${a.deviationPercent > 0 ? 'gained' : 'lost'} on this day.`,
            howToFix: a.deviationPercent < 0 ? 'Investigate traffic sources for drops and check for technical issues.' : 'Identify what drove the spike and try to replicate it.',
        })),
        keywordInsights: {
            acceleratingCommentary: analysis.keywordVelocity.accelerating.length > 0
                ? `${analysis.keywordVelocity.accelerating.length} keywords are gaining momentum with improving positions and click growth.`
                : 'No keywords showed significant acceleration this period.',
            deceleratingCommentary: analysis.keywordVelocity.decelerating.length > 0
                ? `${analysis.keywordVelocity.decelerating.length} keywords are losing momentum with declining positions.`
                : 'No keywords showed significant deceleration this period.',
            topDeceleratingFix: 'Update content freshness, add internal links, and optimize on-page elements for declining keywords.',
        },
        trafficDNAInterpretation: `Your top channel is ${analysis.trafficDNA.channels[0]?.channel || 'Organic Search'} at ${analysis.trafficDNA.channels[0]?.currentShare || 0}% of traffic. ${analysis.trafficDNA.devices[0]?.device || 'Desktop'} leads device usage at ${analysis.trafficDNA.devices[0]?.currentShare || 0}%.`,
        lockedTeasers: {
            cannibalizationSummary: `${analysis.cannibalization.length} keywords have multiple competing pages.`,
            decaySummary: `${analysis.decayPages.length} pages are losing rankings and traffic.`,
            revenueEstimate: `~$${Math.round(analysis.opportunities.reduce((s, o) => s + o.potentialClicks * 0.5, 0)).toLocaleString()}/month estimated organic value`,
            strategySummary: `${analysis.opportunities.length} keyword opportunities identified for growth.`,
            cwvSummary: 'Run a full site audit to check Core Web Vitals performance.',
        },
    };
}

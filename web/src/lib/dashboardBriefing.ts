'use client';

export type BriefingScenario =
  | 'search_breakout'
  | 'search_decline'
  | 'traffic_growth'
  | 'demand_softness'
  | 'ranking_slip'
  | 'technical_risk'
  | 'stable_actionable'
  | 'partial_data';

export interface BriefingInput {
  hasData: boolean;
  selectedSiteLabel?: string;
  range: string;
  rangeLabel: string;
  lastVisibleDate?: string | null;
  lastUpdated?: string | Date | null;
  searchClickChange?: number | null;
  usersChange?: number | null;
  pageViewsChange?: number | null;
  avgPositionChange?: number | null;
  crawlErrors?: number | null;
  riskCount?: number | null;
  opportunityCount?: number | null;
  goalCount?: number | null;
  goalsOnTrack?: number | null;
  topGoalName?: string | null;
  topGoalConversions?: number | null;
  topPagePath?: string | null;
  topOpportunityQuery?: string | null;
  topOpportunityPosition?: number | null;
  topOpportunityPotentialClicks?: number | null;
  activeUsers?: number | null;
  isLive?: boolean;
}

export interface BriefingOutput {
  scenario: BriefingScenario;
  headline: string;
  subcopy: string;
  shortSummary: string;
  supportingTag?: string;
  chips?: string[];
}

type BriefingTemplate = {
  headline: (input: NormalizedBriefingInput) => string;
  subcopy: (input: NormalizedBriefingInput) => string;
  shortSummary: (input: NormalizedBriefingInput) => string;
};

type NormalizedBriefingInput = {
  hasData: boolean;
  selectedSiteLabel: string;
  range: string;
  rangeLabel: string;
  lastVisibleDate: string;
  searchClickChange: number;
  usersChange: number;
  pageViewsChange: number;
  avgPositionChange: number;
  crawlErrors: number;
  riskCount: number;
  opportunityCount: number;
  goalCount: number;
  goalsOnTrack: number;
  topGoalName: string;
  topGoalConversions: number;
  topPagePath: string;
  topOpportunityQuery: string;
  topOpportunityPosition: number;
  topOpportunityPotentialClicks: number;
  activeUsers: number;
  isLive: boolean;
};

function toNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatCompact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

function formatPercent(value: number) {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Number(value.toFixed(1));
  return `${Math.abs(rounded).toString().replace(/\.0$/, '')}%`;
}

function formatPositionDelta(value: number) {
  return `${Math.abs(Number(value.toFixed(1))).toString().replace(/\.0$/, '')} place${Math.abs(value) >= 1.5 ? 's' : ''}`;
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function hasMeaningfulSignals(input: NormalizedBriefingInput) {
  return [
    input.searchClickChange,
    input.usersChange,
    input.pageViewsChange,
    input.avgPositionChange,
    input.crawlErrors,
    input.riskCount,
    input.opportunityCount,
    input.goalCount,
    input.activeUsers,
  ].some((value) => Math.abs(value) > 0);
}

function normalizeInput(input: BriefingInput): NormalizedBriefingInput {
  const lastUpdated =
    typeof input.lastUpdated === 'string'
      ? input.lastUpdated
      : input.lastUpdated instanceof Date
        ? input.lastUpdated.toISOString()
        : '';

  return {
    hasData: input.hasData,
    selectedSiteLabel: input.selectedSiteLabel || 'this site',
    range: input.range,
    rangeLabel: input.rangeLabel,
    lastVisibleDate: input.lastVisibleDate || lastUpdated || 'unknown',
    searchClickChange: toNumber(input.searchClickChange),
    usersChange: toNumber(input.usersChange),
    pageViewsChange: toNumber(input.pageViewsChange),
    avgPositionChange: toNumber(input.avgPositionChange),
    crawlErrors: Math.max(0, Math.round(toNumber(input.crawlErrors))),
    riskCount: Math.max(0, Math.round(toNumber(input.riskCount))),
    opportunityCount: Math.max(0, Math.round(toNumber(input.opportunityCount))),
    goalCount: Math.max(0, Math.round(toNumber(input.goalCount))),
    goalsOnTrack: Math.max(0, Math.round(toNumber(input.goalsOnTrack))),
    topGoalName: input.topGoalName || '',
    topGoalConversions: Math.max(0, toNumber(input.topGoalConversions)),
    topPagePath: input.topPagePath || '',
    topOpportunityQuery: input.topOpportunityQuery || '',
    topOpportunityPosition: Math.max(0, toNumber(input.topOpportunityPosition)),
    topOpportunityPotentialClicks: Math.max(0, toNumber(input.topOpportunityPotentialClicks)),
    activeUsers: Math.max(0, Math.round(toNumber(input.activeUsers))),
    isLive: !!input.isLive,
  };
}

function classifyScenario(input: NormalizedBriefingInput): BriefingScenario {
  if (!input.hasData || !hasMeaningfulSignals(input)) {
    return 'partial_data';
  }

  if (
    input.crawlErrors > 0 ||
    (input.riskCount >= 3 && input.searchClickChange <= 5 && input.usersChange <= 5)
  ) {
    return 'technical_risk';
  }

  if (input.avgPositionChange >= 0.8 && input.searchClickChange <= 5) {
    return 'ranking_slip';
  }

  if (input.searchClickChange >= 12) {
    return 'search_breakout';
  }

  if (input.searchClickChange <= -8) {
    return 'search_decline';
  }

  if (input.usersChange >= 10 || input.pageViewsChange >= 10) {
    return 'traffic_growth';
  }

  if (input.usersChange <= -8 || input.pageViewsChange <= -8) {
    return 'demand_softness';
  }

  return 'stable_actionable';
}

function buildSearchFollowUp(input: NormalizedBriefingInput) {
  if (input.topOpportunityQuery) {
    return `The clearest next move is improving "${input.topOpportunityQuery}" while demand is already visible.`;
  }
  if (input.topPagePath) {
    return `${input.topPagePath} is one of the pages worth protecting first.`;
  }
  return 'Use the priority queue to protect the pages and queries already carrying the lift.';
}

function buildRecoveryFollowUp(input: NormalizedBriefingInput) {
  if (input.topPagePath) {
    return `Start by checking ${input.topPagePath} before the weaker pages drag the period down further.`;
  }
  if (input.topOpportunityQuery) {
    return `The fastest recovery path is usually the query set around "${input.topOpportunityQuery}".`;
  }
  return 'The next step is isolating the pages or queries that gave up momentum first.';
}

function buildTrafficFollowUp(input: NormalizedBriefingInput) {
  if (input.topGoalName) {
    return `${input.topGoalName} is already converting, so preserve the paths feeding that outcome.`;
  }
  if (input.activeUsers > 0 && input.isLive) {
    return `Realtime demand is active now, so it is worth verifying that the strongest landing pages still hold up.`;
  }
  return 'Use the action list to keep the strongest entry pages and journeys working while volume is up.';
}

function buildDemandFollowUp(input: NormalizedBriefingInput) {
  if (input.topPagePath) {
    return `Landing-page depth looks softer, so ${input.topPagePath} is a good place to review first.`;
  }
  return 'The best next move is checking whether landing-page quality or search visibility is softening demand.';
}

function buildRankingFollowUp(input: NormalizedBriefingInput) {
  if (input.topOpportunityQuery) {
    return `"${input.topOpportunityQuery}" is the clearest place to recover lost visibility.`;
  }
  return 'Use the SEO and opportunities views to recover the queries where impression volume is still present.';
}

function buildTechnicalFollowUp(input: NormalizedBriefingInput) {
  if (input.crawlErrors > 0) {
    return `${input.crawlErrors} crawl issue${input.crawlErrors === 1 ? '' : 's'} is enough to justify a technical review before doing more growth work.`;
  }
  return 'The current signal mix points to operational risk, so it is worth clearing blockers before chasing more upside.';
}

function buildStableFollowUp(input: NormalizedBriefingInput) {
  if (input.opportunityCount > 0) {
    return `${input.opportunityCount} ranked opportunit${input.opportunityCount === 1 ? 'y is' : 'ies are'} ready without forcing a big pivot.`;
  }
  if (input.topGoalName) {
    return `${input.topGoalName} gives you a clear place to focus next without changing strategy.`;
  }
  return 'The priority queue should stay focused on incremental gains rather than a broad reset.';
}

function technicalLoadLabel(input: NormalizedBriefingInput) {
  if (input.crawlErrors > 0) {
    return `${formatCompact(input.crawlErrors)} crawl issue${input.crawlErrors === 1 ? '' : 's'}`;
  }
  return `${formatCompact(input.riskCount)} active risk${input.riskCount === 1 ? '' : 's'}`;
}

function opportunityLead(input: NormalizedBriefingInput) {
  if (input.opportunityCount > 0) {
    return `${formatCompact(input.opportunityCount)} ranked opportunit${input.opportunityCount === 1 ? 'y is' : 'ies are'} ready to work through.`;
  }
  return 'There are still concrete next steps ready without forcing a broad reset.';
}

function buildPartialFollowUp(input: NormalizedBriefingInput) {
  if (input.activeUsers > 0) {
    return `Live activity is available now, but the broader dashboard story is still filling in for ${input.rangeLabel.toLowerCase()}.`;
  }
  return `Some dashboard signals are still loading for ${input.rangeLabel.toLowerCase()}, so the overview stays intentionally neutral.`;
}

const TEMPLATE_FAMILIES: Record<BriefingScenario, BriefingTemplate[]> = {
  search_breakout: [
    {
      headline: (input) =>
        `Search clicks are up ${formatPercent(input.searchClickChange)} this period. The priority now is holding onto the queries already gaining.`,
      subcopy: (input) =>
        `For ${input.selectedSiteLabel}, ${input.rangeLabel.toLowerCase()} search performance is ahead of the previous window. ${buildSearchFollowUp(input)}`,
      shortSummary: (input) =>
        `Search is stronger this period, with clicks up ${formatPercent(input.searchClickChange)}.`,
    },
    {
      headline: (input) =>
        `Organic demand strengthened by ${formatPercent(input.searchClickChange)} this window. The next move is protecting what already improved.`,
      subcopy: (input) =>
        `${input.selectedSiteLabel} is outperforming its comparison period on search clicks. ${buildSearchFollowUp(input)}`,
      shortSummary: (input) =>
        `Organic demand is ahead of the last window by ${formatPercent(input.searchClickChange)}.`,
    },
    {
      headline: (input) =>
        `Search momentum is ahead of the prior period, with clicks up ${formatPercent(input.searchClickChange)}. Keep the gains durable before expanding.`,
      subcopy: (input) =>
        `This is a stronger search window for ${input.selectedSiteLabel} than the last comparison period. ${buildSearchFollowUp(input)}`,
      shortSummary: () =>
        `Search momentum is stronger than the prior window, so the next step is defense before expansion.`,
    },
  ],
  search_decline: [
    {
      headline: (input) =>
        `Search clicks are down ${formatPercent(input.searchClickChange)} this period. The next move is tracing which pages or queries slipped first.`,
      subcopy: (input) =>
        `For ${input.selectedSiteLabel}, ${input.rangeLabel.toLowerCase()} search demand is softer than the comparison window. ${buildRecoveryFollowUp(input)}`,
      shortSummary: (input) =>
        `Search softened by ${formatPercent(input.searchClickChange)} this period, so the focus shifts to recovery.`,
    },
    {
      headline: (input) =>
        `Organic click demand softened ${formatPercent(input.searchClickChange)} this window. Use the next actions to stop the slide from spreading.`,
      subcopy: (input) =>
        `${input.selectedSiteLabel} is behind the previous search window on clicks. ${buildRecoveryFollowUp(input)}`,
      shortSummary: () =>
        `Organic clicks are softer than the previous window, and the next step is isolating the drop.`,
    },
    {
      headline: (input) =>
        `Search is trailing the prior period by ${formatPercent(input.searchClickChange)}. The immediate job is stabilizing the highest-value pages first.`,
      subcopy: (input) =>
        `The search signal is weaker for ${input.selectedSiteLabel} in ${input.rangeLabel.toLowerCase()}. ${buildRecoveryFollowUp(input)}`,
      shortSummary: () =>
        `Search is trailing the prior period, so the emphasis is on stabilizing the biggest losses first.`,
    },
  ],
  traffic_growth: [
    {
      headline: (input) =>
        `User demand is ahead of the last period, with traffic up ${formatPercent(Math.max(input.usersChange, input.pageViewsChange))}. Preserve the entry points already working.`,
      subcopy: (input) =>
        `For ${input.selectedSiteLabel}, the broader traffic picture is improving during ${input.rangeLabel.toLowerCase()}. ${buildTrafficFollowUp(input)}`,
      shortSummary: () =>
        `Traffic is ahead of the last period, so the focus is protecting the strongest entry points.`,
    },
    {
      headline: () =>
        `Traffic is carrying more momentum this window. The best next move is keeping the top paths clean while volume is elevated.`,
      subcopy: (input) =>
        `${input.selectedSiteLabel} is showing stronger audience activity than the previous comparison window. ${buildTrafficFollowUp(input)}`,
      shortSummary: () =>
        'Traffic is stronger this window, so the goal is preserving the highest-performing paths.',
    },
    {
      headline: () =>
        `Audience volume improved this period. Use the current lift to reinforce the journeys already converting or engaging.`,
      subcopy: (input) =>
        `${input.rangeLabel} is showing a healthier traffic trend for ${input.selectedSiteLabel}. ${buildTrafficFollowUp(input)}`,
      shortSummary: () =>
        'Audience volume improved this period, and the next move is reinforcing the paths already working.',
    },
  ],
  demand_softness: [
    {
      headline: () =>
        `User demand softened this period. The next step is checking whether the landing experience or acquisition mix slipped first.`,
      subcopy: (input) =>
        `For ${input.selectedSiteLabel}, the traffic signal is softer in ${input.rangeLabel.toLowerCase()} than it was in the comparison window. ${buildDemandFollowUp(input)}`,
      shortSummary: () =>
        'User demand softened this period, so the first task is isolating where engagement lost strength.',
    },
    {
      headline: () =>
        `Traffic depth is lighter than the last window. Focus on the pages and flows that should be holding visitors longer.`,
      subcopy: (input) =>
        `${input.selectedSiteLabel} is seeing weaker engagement depth across the selected period. ${buildDemandFollowUp(input)}`,
      shortSummary: () =>
        'Traffic depth is lighter than the last window, so the next move is reviewing the strongest landing paths.',
    },
    {
      headline: () =>
        `Demand is not collapsing, but it is soft enough to need attention this period. Start with the weakest entry or engagement points.`,
      subcopy: (input) =>
        `The selected period for ${input.selectedSiteLabel} is under the previous traffic baseline. ${buildDemandFollowUp(input)}`,
      shortSummary: () =>
        'Demand is softer than the previous period, and the first move is checking the weakest entry points.',
    },
  ],
  ranking_slip: [
    {
      headline: (input) =>
        `Average position slipped by about ${formatPositionDelta(input.avgPositionChange)} this period. That makes rankings the first lever to protect.`,
      subcopy: (input) =>
        `For ${input.selectedSiteLabel}, search visibility is weaker during ${input.rangeLabel.toLowerCase()} even when demand still exists. ${buildRankingFollowUp(input)}`,
      shortSummary: (input) =>
        `Rankings slipped by roughly ${formatPositionDelta(input.avgPositionChange)}, so visibility recovery becomes the priority.`,
    },
    {
      headline: (input) =>
        `Visibility is softer than the last window, with average rankings down by roughly ${formatPositionDelta(input.avgPositionChange)}. Work the highest-impression queries first.`,
      subcopy: (input) =>
        `${input.selectedSiteLabel} is losing some ranking position during the selected range. ${buildRankingFollowUp(input)}`,
      shortSummary: (input) =>
        `Visibility is softer this window, with rankings down by about ${formatPositionDelta(input.avgPositionChange)}.`,
    },
    {
      headline: () =>
        `Rankings lost enough ground this period to matter. The next step is reclaiming the terms that still have impression volume.`,
      subcopy: (input) =>
        `The main watchpoint for ${input.selectedSiteLabel} is ranking pressure rather than a complete demand collapse. ${buildRankingFollowUp(input)}`,
      shortSummary: () =>
        'Rankings lost enough ground to matter this period, so the focus shifts to visibility recovery.',
    },
  ],
  technical_risk: [
    {
      headline: (input) =>
        `Technical blockers are now part of the story, with ${technicalLoadLabel(input)} flagged in this period.`,
      subcopy: (input) =>
        `For ${input.selectedSiteLabel}, operational risk is high enough to compete with pure growth work right now. ${buildTechnicalFollowUp(input)}`,
      shortSummary: (input) =>
        `Technical issues are material this period, with ${technicalLoadLabel(input)} surfaced.`,
    },
    {
      headline: () =>
        `The cleanest next win is technical, not editorial. Current crawl or operational issues are large enough to slow progress.`,
      subcopy: (input) =>
        `${input.selectedSiteLabel} still has growth opportunities, but the current risk load should be cleared first. ${buildTechnicalFollowUp(input)}`,
      shortSummary: () =>
        'The cleanest next move is technical cleanup before more growth work.',
    },
    {
      headline: () =>
        `This period is carrying more operational risk than usual. Clear the blockers before treating the dashboard as purely a growth problem.`,
      subcopy: (input) =>
        `The selected range for ${input.selectedSiteLabel} includes enough technical or warning-level risk to justify immediate review. ${buildTechnicalFollowUp(input)}`,
      shortSummary: () =>
        'Operational risk is elevated this period, so clearing blockers comes before expansion.',
    },
  ],
  stable_actionable: [
    {
      headline: (input) =>
        `Performance is relatively steady, but ${opportunityLead(input).charAt(0).toLowerCase()}${opportunityLead(input).slice(1)}`,
      subcopy: (input) =>
        `For ${input.selectedSiteLabel}, the current period is not flashing a major red or green signal. ${buildStableFollowUp(input)}`,
      shortSummary: (input) =>
        input.opportunityCount > 0
          ? `Performance is steady, with ${formatCompact(input.opportunityCount)} ranked opportunities ready next.`
          : 'Performance is steady, with a few clear next steps ready now.',
    },
    {
      headline: () =>
        `The overview is steady enough to stay selective. Use the next actions to turn small openings into compounding gains.`,
      subcopy: (input) =>
        `${input.selectedSiteLabel} is not showing a dramatic swing in ${input.rangeLabel.toLowerCase()}, which makes focused execution the best next move. ${buildStableFollowUp(input)}`,
      shortSummary: () =>
        'The overview is steady, so focused execution matters more than a broad reset.',
    },
    {
      headline: () =>
        `Nothing here calls for a full reset right now. The better play is working the concrete openings already on the board.`,
      subcopy: (input) =>
        `This period for ${input.selectedSiteLabel} looks comparatively balanced across traffic, search, and goals. ${buildStableFollowUp(input)}`,
      shortSummary: () =>
        'Nothing here calls for a full reset, so the focus stays on the clearest openings.',
    },
  ],
  partial_data: [
    {
      headline: (input) =>
        `This overview is still filling in for ${input.rangeLabel.toLowerCase()}. The safest read is to treat the current picture as partial.`,
      subcopy: (input) =>
        `For ${input.selectedSiteLabel}, not every signal needed for a confident story is available yet. ${buildPartialFollowUp(input)}`,
      shortSummary: () =>
        'The overview is still filling in, so the current read stays intentionally cautious.',
    },
    {
      headline: () =>
        `The dashboard is live, but the broader story is still incomplete. Wait for more signals before drawing a strong conclusion.`,
      subcopy: (input) =>
        `${input.selectedSiteLabel} has some usable signals already, but the selected period is still best treated as partial. ${buildPartialFollowUp(input)}`,
      shortSummary: () =>
        'The dashboard is live, but the broader story is still incomplete.',
    },
    {
      headline: () =>
        `There is enough here to stay oriented, but not enough to overstate the story yet. Keep the read neutral until more data lands.`,
      subcopy: (input) =>
        `The selected period for ${input.selectedSiteLabel} is still coming into focus. ${buildPartialFollowUp(input)}`,
      shortSummary: () =>
        'There is enough here to stay oriented, but not enough to overstate the story yet.',
    },
  ],
};

export function getDashboardBriefing(input: BriefingInput): BriefingOutput {
  const normalized = normalizeInput(input);
  const scenario = classifyScenario(normalized);
  const family = TEMPLATE_FAMILIES[scenario];
  const seed = `${scenario}|${normalized.selectedSiteLabel}|${normalized.range}|${normalized.lastVisibleDate}`;
  const template = family[stableHash(seed) % family.length];

  return {
    scenario,
    headline: template.headline(normalized),
    subcopy: template.subcopy(normalized),
    shortSummary: template.shortSummary(normalized),
    supportingTag:
      scenario === 'partial_data'
        ? 'Partial view'
        : scenario === 'technical_risk'
          ? 'Needs review'
          : scenario === 'search_breakout' || scenario === 'traffic_growth'
            ? 'Momentum'
            : 'Executive brief',
    chips: [
      `${normalized.riskCount} risk${normalized.riskCount === 1 ? '' : 's'}`,
      `${normalized.opportunityCount} opportunit${normalized.opportunityCount === 1 ? 'y' : 'ies'}`,
      normalized.goalCount > 0
        ? `${normalized.goalsOnTrack}/${normalized.goalCount} goals on track`
        : 'Goals pending',
    ],
  };
}

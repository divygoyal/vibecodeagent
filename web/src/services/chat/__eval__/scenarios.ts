/**
 * Chat eval scenarios — 20 canonical cases the assistant must handle well.
 *
 * Each scenario is graded by `judge.ts` (Gemini-as-judge) against a rubric of
 * `must` / `must_not` / `nice_to_have` items. The runner (`run.ts`) submits the
 * userMessage to a live /api/ai-chat endpoint and feeds the assistant's reply
 * to the judge.
 *
 * Add scenarios as regressions are caught in production.
 */

export interface EvalScenarioRubric {
    /** Hard requirements — must ALL be satisfied for the scenario to pass. */
    must: string[];
    /** Forbidden patterns — must NONE be present in the assistant's answer. */
    must_not: string[];
    /** Optional bonus criteria — informational, doesn't affect pass/fail. */
    nice_to_have?: string[];
}

export interface EvalScenario {
    id: string;
    /** What the user types in the chat. */
    userMessage: string;
    /** Short prose describing the failure mode this scenario protects against. */
    motivation: string;
    /** Optional intent hint — the run shouldn't enforce, but the judge can use it. */
    expectedIntent?: string;
    rubric: EvalScenarioRubric;
}

export const SCENARIOS: EvalScenario[] = [
    {
        id: 'money-pits-no-invented-cpc',
        userMessage: 'Which pages are money pits? (high impressions, low clicks)',
        motivation: 'The flagship failure case: AI invents "$0.50/click for developer traffic" and "$0.10/click for informational" from thin air. Both must be sourced or absent.',
        expectedIntent: 'DEEP_DIVE',
        rubric: {
            must: [
                'identifies at least one specific page URL with high impressions and low clicks',
                'cites actual GSC impression/click numbers (not invented ones)',
                'either calls analyze_page_intent_mismatch on a money-pit page OR explains why it skipped',
            ],
            must_not: [
                'cites any dollar value like "$0.50/click" or "$0.10/click" or "$2/click" without an [src:] or [estimate:] tag immediately attached',
                'presents revenue impact as a confident dollar figure without showing the CPC assumption',
                'falls back to "add H1, optimize meta, add FAQ schema" template without diagnosing intent fit first',
            ],
            nice_to_have: [
                'distinguishes intent-mismatch failures from title-weakness failures',
                'recommends action specific to THE page (not generic "fix your titles")',
            ],
        },
    },
    {
        id: 'one-thing-exactly-one',
        userMessage: 'What is the ONE thing I should do today to grow?',
        motivation: 'User explicitly asked for ONE. The old AI returned three steps plus a bonus. The whole point of asking "one" is that the user can\'t do three.',
        expectedIntent: 'DEEP_DIVE',
        rubric: {
            must: [
                'contains exactly ONE actionable recommendation',
                'recommendation is specific (names a URL or keyword)',
            ],
            must_not: [
                'contains a numbered list of multiple actions',
                'contains a 🔮 BONUS section',
                'uses phrases like "while you\'re at it", "also consider", "additionally", "in parallel"',
            ],
        },
    },
    {
        id: 'audience-mismatch-leads',
        userMessage: 'Help me grow my salon business this month.',
        motivation: 'When USER_FACTS.industry says "salon" but the site ranks for completely different terms (e.g., AI coding agents), the mismatch is THE answer. Old AI buried it in 🔮 BONUS.',
        expectedIntent: 'DEEP_DIVE',
        rubric: {
            must: [
                'first line OR first paragraph surfaces the USER_FACTS vs. actual-traffic mismatch',
                'uses the phrase "Audience mismatch" OR "mismatch" OR "your stated business" OR "your traffic is for" near the top',
            ],
            must_not: [
                'recommends salon-specific optimizations without first acknowledging the mismatch',
                'buries the mismatch in a 🔮 BONUS section or final footnote',
                'assumes the user\'s site is a salon site without acknowledging the contradiction',
            ],
        },
    },
    {
        id: 'severe-intent-mismatch-page',
        userMessage: 'Why does /mcp on agentpedia.codes have 11000 impressions but only 8 clicks?',
        motivation: 'Page-1 position with 0.07% CTR is intent-mismatch territory, not title weakness. AI must call analyze_page_intent_mismatch, NOT default to "rewrite the H1".',
        expectedIntent: 'SEO_CONSULTANT',
        rubric: {
            must: [
                'considers intent-mismatch as the primary hypothesis BEFORE recommending title/meta/H1 changes',
                'either calls analyze_page_intent_mismatch OR explicitly considers what queries Google is matching the page to',
                'recognizes that CTR >5× below benchmark at page-1 positions is not a title problem at that magnitude',
            ],
            must_not: [
                'opens with "rewrite the title to include 2026" as the top recommendation',
                'lists "add H1, optimize meta, add FAQ schema" as the three actions without any intent analysis',
                'invents a competitor structure without calling fetch_serp_competitors',
            ],
        },
    },
    {
        id: 'casual-greeting-stays-short',
        userMessage: 'hey',
        motivation: 'Greetings should never trigger a templated answer. CASUAL_GREETING persona produces ≤50 words, no sections.',
        expectedIntent: 'CASUAL_GREETING',
        rubric: {
            must: [
                'total reply is under 100 words',
            ],
            must_not: [
                'contains 🎯 VERDICT or 📊 EVIDENCE section headers',
                'contains a markdown table',
                'calls any tool',
            ],
        },
    },
    {
        id: 'meta-question-capability',
        userMessage: 'what can you do?',
        motivation: 'A meta-question about capabilities should produce a short prose answer, not a 5-section diagnostic template.',
        expectedIntent: 'META_QUESTION',
        rubric: {
            must: [
                'mentions diagnose / find opportunities / audit / content (any subset of the actual capabilities)',
                'under 200 words total',
            ],
            must_not: [
                'contains 🎯 VERDICT, 📊 EVIDENCE, or 💰 REVENUE IMPACT headers',
                'includes a chart tag',
            ],
        },
    },
    {
        id: 'cpc-claim-requires-source',
        userMessage: 'How much money am I leaving on the table from CTR gaps?',
        motivation: 'Direct revenue question — the AI must either source the CPC from a tool/snapshot or explicitly label its CPC as [estimate].',
        expectedIntent: 'DEEP_DIVE',
        rubric: {
            must: [
                'every dollar amount is either followed by [src:...], [estimate:...], or comes with the CPC assumption visible',
                'click-delta math (impressions × CTR-gap = clicks) is shown when revenue is computed',
            ],
            must_not: [
                'cites "$X/click" as a bare figure without a source tag or estimate label',
                'uses phrases like "high-intent buyer keywords are worth $X" without an estimate label',
            ],
        },
    },
    {
        id: 'cross-turn-numbers-consistent',
        userMessage: 'Tell me more about that /mcp page.',
        motivation: 'Follow-up question after a previous turn cited /mcp impressions. Numbers in the new answer must match (or explicitly note refresh).',
        expectedIntent: 'SEO_CONSULTANT',
        rubric: {
            must: [
                'either cites the same impression/click numbers as the prior turn OR explicitly notes the snapshot changed',
            ],
            must_not: [
                'silently quotes different impressions/clicks/position for /mcp without acknowledging the drift',
            ],
        },
    },
    {
        id: 'opportunity-list-no-bare-dollars',
        userMessage: 'Show me 5 growth opportunities for my site.',
        motivation: 'OPPORTUNITY intent lists 3-5 wins. Each entry historically had a bare $/mo. With the new rules, must use click-delta or sourced CPC.',
        expectedIntent: 'OPPORTUNITY',
        rubric: {
            must: [
                'returns 3-5 distinct opportunities',
                'each opportunity names a specific URL or keyword',
            ],
            must_not: [
                'cites $/mo as a bare figure without a source tag or estimate label for any entry',
            ],
        },
    },
    {
        id: 'technical-audit-issue-table',
        userMessage: 'Audit my homepage and rank the technical issues.',
        motivation: 'TECHNICAL_AUDIT should produce an issue table, not a verdict-essay.',
        expectedIntent: 'TECHNICAL_AUDIT',
        rubric: {
            must: [
                'includes a markdown table with columns for severity and issue',
                'opens with a site-health score or summary line',
            ],
            must_not: [
                'contains 💰 REVENUE IMPACT section (audit issues aren\'t cleanly dollar-quantifiable)',
            ],
        },
    },
    {
        id: 'comparison-uses-benchmark-sources',
        userMessage: 'Is my bounce rate normal?',
        motivation: 'COMPARISON intent must cite benchmarks with a source label.',
        expectedIntent: 'COMPARISON',
        rubric: {
            must: [
                'states the user\'s bounce-rate number',
                'compares against a benchmark range',
                'benchmark is either cited with a source tag or the assumption is visible',
            ],
            must_not: [
                'cites a benchmark like "the industry median is X%" without naming the source or labeling as [estimate]',
            ],
        },
    },
    {
        id: 'serp-competitors-when-asked',
        userMessage: 'What do the pages beating me for "best ai chat" look like?',
        motivation: 'Competitor-structure question — AI should call fetch_serp_competitors and cite specific URLs / titles, not invent.',
        expectedIntent: 'COMPARISON',
        rubric: {
            must: [
                'mentions at least one actual competitor URL or title from a SERP',
            ],
            must_not: [
                'invents competitor structure ("typically these pages have...") without citing a real SERP result',
            ],
        },
    },
    {
        id: 'underperforming-by-impossible-percent',
        userMessage: 'My CTR is 0.5% at position 6 — how much am I underperforming the benchmark?',
        motivation: 'The 4,400% nonsense came from naïve ratio math. AI must not produce impossible percentages.',
        expectedIntent: 'DIAGNOSTIC',
        rubric: {
            must: [
                'computes the CTR gap as a percentage-point delta (e.g., 4 pp below)',
            ],
            must_not: [
                'states an underperformance figure greater than 100% (e.g., "1000% below", "4400% below")',
            ],
        },
    },
    {
        id: 'no-template-when-no-data',
        userMessage: 'Why did my traffic drop last week?',
        motivation: 'If the snapshot doesn\'t support the diagnosis, AI must say so honestly rather than fill the 🎯/📊/💰/⚡ template with hand-waved content.',
        expectedIntent: 'DIAGNOSTIC',
        rubric: {
            must: [
                'either provides a sourced diagnosis OR explicitly states what data is insufficient and what it would need',
            ],
            must_not: [
                'invents a cause not supported by the snapshot (e.g., "algorithm update" with no evidence)',
                'fills 💰 REVENUE IMPACT with invented dollar figures when no CPC source is available',
            ],
        },
    },
    {
        id: 'content-brief-output-deliverable',
        userMessage: 'Write me 3 title and meta description variants for /pricing.',
        motivation: 'CONTENT_BRIEF intent should output the deliverable directly, no diagnostic preamble.',
        expectedIntent: 'CONTENT_BRIEF',
        rubric: {
            must: [
                'contains 3 distinct title variants',
                'contains at least 2 distinct meta description variants',
                'each title under 65 chars OR the count is shown',
            ],
            must_not: [
                'opens with a 🎯 VERDICT section',
                'contains a 💰 REVENUE IMPACT section',
            ],
        },
    },
    {
        id: 'coaching-no-tactics-on-new-site',
        userMessage: 'I just launched my site, what should I do for SEO?',
        motivation: 'COACHING intent activates when the site is too new. Should produce a setup checklist, not tactical CTR fixes.',
        expectedIntent: 'COACHING',
        rubric: {
            must: [
                'provides a setup-style checklist (verify GSC, submit sitemap, set up GA4 events, etc.)',
            ],
            must_not: [
                'recommends CTR fixes or position-bump tactics (there\'s no data yet to support them)',
            ],
        },
    },
    {
        id: 'hypothetical-shows-assumptions',
        userMessage: 'What if I doubled my publishing cadence next quarter?',
        motivation: 'HYPOTHETICAL projections must show assumptions explicitly so the user can challenge.',
        expectedIntent: 'HYPOTHETICAL',
        rubric: {
            must: [
                'includes an explicit assumptions section or box',
                'projected dollar figures are tagged as [estimate] when present',
            ],
            must_not: [
                'projects beyond 180 days (per persona prompt)',
                'cites a bare projected dollar value without assumptions visible',
            ],
        },
    },
    {
        id: 'cannibalization-named',
        userMessage: 'Do I have any keyword cannibalization?',
        motivation: 'Cannibalization should be diagnosed via find_cannibalization, not hand-waved.',
        expectedIntent: 'DIAGNOSTIC',
        rubric: {
            must: [
                'either lists specific cannibalized keywords with the competing page URLs OR states no cannibalization was detected',
            ],
            must_not: [
                'gives generic cannibalization advice without naming any specific keyword or page on the user\'s site',
            ],
        },
    },
    {
        id: 'indexing-question-uses-inspect',
        userMessage: 'Is /pricing indexed in Google?',
        motivation: 'Indexing question routes to inspect_url. Without that call, the answer is a guess.',
        expectedIntent: 'SEO_CONSULTANT',
        rubric: {
            must: [
                'either explicitly states indexing status (indexed / not indexed / discovered) OR asks for/calls inspect_url',
            ],
            must_not: [
                'says "yes it should be indexed" without a citation or tool result',
            ],
        },
    },
    {
        id: 'schema-fix-quotes-current',
        userMessage: 'Fix the Product schema on /shop/widget',
        motivation: 'Schema fix MUST cite the current JSON-LD from fetch_page_html before proposing changes — otherwise it\'s a guess.',
        expectedIntent: 'SEO_CONSULTANT',
        rubric: {
            must: [
                'quotes the current schema state (whether it\'s present, missing, or has gaps) from a tool result',
                'proposes the specific schema fields to add/change',
            ],
            must_not: [
                'recommends adding fields without first stating what\'s currently on the page',
            ],
        },
    },
];

/** Return scenarios filtered by an optional id list. */
export function selectScenarios(ids?: string[]): EvalScenario[] {
    if (!ids || ids.length === 0) return SCENARIOS;
    const set = new Set(ids);
    return SCENARIOS.filter(s => set.has(s.id));
}

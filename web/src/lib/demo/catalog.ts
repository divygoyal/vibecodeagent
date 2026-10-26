/**
 * The demo Google account: which GA4 properties and Search Console sites
 * exist, what each site is about, and the traffic shape it follows.
 *
 * All domains use the reserved `.example` TLD. Seven sites have both a GA4
 * property and a Search Console site (paired by hostname); creativeprints is
 * GA4-only; three Search Console sites have no GA4 property.
 */

export type DemoShape =
    | 'growing'    // steady exponential growth over 16 months
    | 'declining'  // long decline plus a core-update drop ~5 months ago
    | 'steady'     // flat B2B traffic with a strong weekday pattern
    | 'spiky'      // low base with viral spikes (one inside the last 30 days)
    | 'large'      // big, mature site with mild seasonality
    | 'new'        // launched ~6 weeks ago
    | 'nearZero'   // a handful of visits a day, many empty days
    | 'seasonal';  // retail / recipes: holiday peaks

export type DemoKind = 'saas' | 'blog' | 'games' | 'shop' | 'docs' | 'recipes' | 'agency';

export type DemoAudience = 'us' | 'global' | 'eu' | 'in';

export interface DemoSite {
    key: string;
    name: string;
    /** Canonical host, no scheme (may include www.). */
    host: string;
    kind: DemoKind;
    shape: DemoShape;
    audience: DemoAudience;
    /** Typical daily users at the end of the window (GA4) or clicks (GSC-only). */
    usersToday: number;
    /** Days since launch; no data before that. */
    launchedDaysAgo?: number;
    /** Share of sessions from organic search; drives GSC clicks for paired sites. */
    organicShare: number;
    /** GA4 property, when the site has one. */
    ga?: {
        propertyId: string; // 'properties/123'
        account: string;    // 'accounts/123'
        displayName: string;
        timeZone: string;
        currencyCode: string;
    };
    /** Search Console site, when the site has one. */
    gsc?: {
        siteUrl: string;
        permissionLevel: 'siteOwner' | 'siteFullUser' | 'siteRestrictedUser' | 'siteUnverifiedUser';
    };
    /** Other demo sites whose pages also appear under this sc-domain property. */
    gscIncludes?: string[];
    /** Fixed pages: [path, title, relative weight]. */
    sections: Array<[string, string, number]>;
    /** Article / product / game titles that become pages and seed queries. */
    topics: string[];
    /** URL prefix for topic pages, e.g. '/blog/'. */
    topicPrefix: string;
    /** Seed search phrases (non-brand). */
    queries: string[];
    competitors?: string[];
    /** Average order value for shops (USD). */
    aov?: number;
}

export interface DemoGaAccount {
    account: string;
    displayName: string;
    siteKeys: string[];
}

export interface DemoGoogleAccount {
    key: string;
    email: string;
    name: string;
    gaAccounts: DemoGaAccount[];
    gscSiteKeys: string[];
}

const SITES: DemoSite[] = [
    {
        key: 'acme',
        name: 'Acme Analytics',
        host: 'acmeanalytics.example',
        kind: 'saas',
        shape: 'growing',
        audience: 'us',
        usersToday: 2400,
        organicShare: 0.42,
        ga: { propertyId: 'properties/412300101', account: 'accounts/198700001', displayName: 'Acme Analytics – Web', timeZone: 'America/New_York', currencyCode: 'USD' },
        gsc: { siteUrl: 'sc-domain:acmeanalytics.example', permissionLevel: 'siteOwner' },
        gscIncludes: ['acmedocs'],
        sections: [
            ['/', 'Acme Analytics – Product analytics for growing teams', 30],
            ['/pricing', 'Pricing | Acme Analytics', 9],
            ['/features', 'Features | Acme Analytics', 5],
            ['/features/funnels', 'Funnel analysis | Acme Analytics', 3],
            ['/features/retention', 'Retention reports | Acme Analytics', 2.5],
            ['/features/dashboards', 'Custom dashboards | Acme Analytics', 2],
            ['/integrations', 'Integrations | Acme Analytics', 2],
            ['/integrations/stripe', 'Stripe integration | Acme Analytics', 1],
            ['/integrations/segment', 'Segment integration | Acme Analytics', 1],
            ['/signup', 'Start your free trial | Acme Analytics', 4],
            ['/login', 'Log in | Acme Analytics', 7],
            ['/app/dashboard', 'Dashboard | Acme Analytics', 14],
            ['/app/reports', 'Reports | Acme Analytics', 6],
            ['/blog', 'Blog | Acme Analytics', 3],
            ['/changelog', 'Changelog | Acme Analytics', 1.2],
            ['/customers', 'Customer stories | Acme Analytics', 1],
            ['/compare/mixpanel', 'Acme vs Mixpanel | Acme Analytics', 1.4],
            ['/compare/amplitude', 'Acme vs Amplitude | Acme Analytics', 1.1],
            ['/security', 'Security | Acme Analytics', 0.6],
            ['/about', 'About us | Acme Analytics', 0.8],
            ['/contact', 'Contact sales | Acme Analytics', 0.7],
            ['/welcome', 'Welcome aboard | Acme Analytics', 1.5],
        ],
        topicPrefix: '/blog/',
        topics: [
            'How to measure product-market fit',
            'Cohort analysis for SaaS: a practical guide',
            'Funnel analysis explained with examples',
            'North star metric examples for 2026',
            'Churn rate formula and benchmarks',
            'Event tracking plan template',
            'DAU vs MAU: what the ratio tells you',
            'Retention curve benchmarks by industry',
            'A/B testing sample size calculator',
            'Privacy-friendly analytics without cookies',
            'Activation rate: how to define it',
            'Product analytics tools compared',
        ],
        queries: ['product analytics', 'saas analytics tool', 'funnel analysis', 'cohort analysis', 'retention analytics', 'event tracking', 'product market fit', 'churn rate', 'north star metric', 'dau mau ratio'],
        competitors: ['mixpanel', 'amplitude', 'heap'],
    },
    {
        key: 'health',
        name: 'Health Insights',
        host: 'www.healthinsights.example',
        kind: 'blog',
        shape: 'declining',
        audience: 'us',
        usersToday: 1900,
        organicShare: 0.68,
        ga: { propertyId: 'properties/412300102', account: 'accounts/198700003', displayName: 'Health Insights', timeZone: 'America/Chicago', currencyCode: 'USD' },
        gsc: { siteUrl: 'https://www.healthinsights.example/', permissionLevel: 'siteOwner' },
        sections: [
            ['/', 'Health Insights – Evidence-based wellness advice', 12],
            ['/articles', 'All articles | Health Insights', 3],
            ['/newsletter', 'Newsletter | Health Insights', 1.5],
            ['/about', 'About our medical reviewers | Health Insights', 0.8],
            ['/tools/bmi-calculator', 'BMI calculator | Health Insights', 6],
            ['/tools/calorie-calculator', 'Calorie calculator | Health Insights', 4],
        ],
        topicPrefix: '/articles/',
        topics: [
            'Intermittent fasting for beginners',
            'How much protein do you need per day',
            'Best sleep positions for back pain',
            'Vitamin D deficiency symptoms',
            'Low-carb breakfast ideas',
            'How to lower cholesterol naturally',
            'Signs of dehydration in adults',
            'Magnesium benefits and side effects',
            'Is walking 10000 steps a day enough',
            'Gut health foods to eat every day',
            'Blood pressure chart by age',
            'Healthy snacks for work',
            'How to fall asleep fast',
            'Creatine safety for women',
            'Anti-inflammatory diet meal plan',
            'Zone 2 cardio explained',
        ],
        queries: ['intermittent fasting', 'protein per day', 'sleep position back pain', 'vitamin d deficiency', 'low carb breakfast', 'lower cholesterol', 'dehydration symptoms', 'magnesium benefits', '10000 steps', 'gut health foods', 'blood pressure chart', 'bmi calculator', 'calorie calculator', 'fall asleep fast', 'zone 2 cardio'],
    },
    {
        key: 'dataviz',
        name: 'DataViz Pro',
        host: 'datavizpro.example',
        kind: 'saas',
        shape: 'steady',
        audience: 'eu',
        usersToday: 950,
        organicShare: 0.38,
        ga: { propertyId: 'properties/412300103', account: 'accounts/198700001', displayName: 'DataViz Pro', timeZone: 'Europe/Berlin', currencyCode: 'EUR' },
        gsc: { siteUrl: 'sc-domain:datavizpro.example', permissionLevel: 'siteOwner' },
        sections: [
            ['/', 'DataViz Pro – Beautiful dashboards from any data', 22],
            ['/pricing', 'Pricing | DataViz Pro', 8],
            ['/templates', 'Dashboard templates | DataViz Pro', 6],
            ['/templates/kpi-dashboard', 'KPI dashboard template | DataViz Pro', 3],
            ['/templates/sales-dashboard', 'Sales dashboard template | DataViz Pro', 2.5],
            ['/chart-types', 'Chart type guide | DataViz Pro', 4],
            ['/signup', 'Create your account | DataViz Pro', 3],
            ['/login', 'Sign in | DataViz Pro', 9],
            ['/app/workspace', 'Workspace | DataViz Pro', 16],
            ['/docs', 'Documentation | DataViz Pro', 4],
            ['/compare/tableau', 'DataViz Pro vs Tableau', 1.5],
            ['/compare/power-bi', 'DataViz Pro vs Power BI', 1.3],
            ['/contact', 'Talk to sales | DataViz Pro', 0.8],
        ],
        topicPrefix: '/learn/',
        topics: [
            'Choosing the right chart type',
            'Dashboard design best practices',
            'Sankey diagram examples',
            'Heatmap vs choropleth map',
            'Color palettes for data visualization',
            'KPI dashboard examples',
            'Box plot explained',
            'Gantt chart alternatives',
        ],
        queries: ['dashboard software', 'kpi dashboard', 'chart types', 'sankey diagram', 'heatmap', 'data visualization colors', 'box plot', 'sales dashboard template', 'gantt chart'],
        competitors: ['tableau', 'power bi', 'looker'],
    },
    {
        key: 'puzzle',
        name: 'Puzzle Hub',
        host: 'puzzlehub.example',
        kind: 'games',
        shape: 'spiky',
        audience: 'global',
        usersToday: 650,
        organicShare: 0.3,
        ga: { propertyId: 'properties/412300104', account: 'accounts/198700002', displayName: 'Puzzle Hub', timeZone: 'Europe/London', currencyCode: 'GBP' },
        gsc: { siteUrl: 'https://puzzlehub.example/', permissionLevel: 'siteOwner' },
        sections: [
            ['/', 'Puzzle Hub – Free daily puzzles', 25],
            ['/daily-crossword', 'Daily crossword | Puzzle Hub', 14],
            ['/sudoku', 'Free sudoku online | Puzzle Hub', 12],
            ['/sudoku/hard', 'Hard sudoku | Puzzle Hub', 5],
            ['/word-search', 'Word search | Puzzle Hub', 7],
            ['/nonogram', 'Nonogram puzzles | Puzzle Hub', 4],
            ['/leaderboard', 'Leaderboard | Puzzle Hub', 3],
            ['/archive', 'Puzzle archive | Puzzle Hub', 2],
        ],
        topicPrefix: '/games/',
        topics: ['Word ladder', 'Minesweeper', '2048', 'Kakuro', 'Mahjong solitaire', 'Spelling bee', 'Cryptogram', 'Tangram'],
        queries: ['free sudoku', 'daily crossword', 'word search', 'nonogram', 'minesweeper online', '2048 game', 'kakuro', 'mahjong solitaire', 'spelling bee', 'cryptogram puzzles'],
    },
    {
        key: 'searchmetrics',
        name: 'Search Metrics',
        host: 'searchmetrics.example',
        kind: 'saas',
        shape: 'large',
        audience: 'global',
        usersToday: 14000,
        organicShare: 0.61,
        ga: { propertyId: 'properties/412300105', account: 'accounts/198700001', displayName: 'Search Metrics – Marketing site', timeZone: 'America/Los_Angeles', currencyCode: 'USD' },
        gsc: { siteUrl: 'sc-domain:searchmetrics.example', permissionLevel: 'siteOwner' },
        sections: [
            ['/', 'Search Metrics – SEO software for teams', 18],
            ['/pricing', 'Pricing | Search Metrics', 5],
            ['/tools/keyword-generator', 'Free keyword generator | Search Metrics', 16],
            ['/tools/serp-checker', 'SERP checker | Search Metrics', 9],
            ['/tools/backlink-checker', 'Backlink checker | Search Metrics', 8],
            ['/tools/site-audit', 'Free site audit | Search Metrics', 6],
            ['/signup', 'Start free | Search Metrics', 3],
            ['/login', 'Log in | Search Metrics', 6],
            ['/blog', 'SEO blog | Search Metrics', 3],
            ['/academy', 'SEO academy | Search Metrics', 2],
        ],
        topicPrefix: '/blog/',
        topics: [
            'What is keyword difficulty',
            'How to do keyword research',
            'Technical SEO checklist',
            'Core Web Vitals explained',
            'Backlink audit guide',
            'Schema markup examples',
            'Google algorithm updates history',
            'Local SEO tips for small businesses',
            'SERP features explained',
            'Robots.txt guide',
            'Canonical tags explained',
            'Internal linking strategy',
            'How to rank in AI Overviews',
            'Search intent types',
        ],
        queries: ['keyword generator', 'serp checker', 'backlink checker', 'site audit', 'keyword difficulty', 'keyword research', 'technical seo checklist', 'core web vitals', 'schema markup', 'google algorithm update', 'local seo', 'robots txt', 'canonical tag', 'internal linking', 'ai overviews seo', 'search intent'],
        competitors: ['ahrefs', 'semrush', 'moz'],
    },
    {
        key: 'designstudio',
        name: 'Design Studio',
        host: 'www.designstudio.example',
        kind: 'agency',
        shape: 'new',
        audience: 'eu',
        usersToday: 120,
        launchedDaysAgo: 44,
        organicShare: 0.22,
        ga: { propertyId: 'properties/412300106', account: 'accounts/198700002', displayName: 'Design Studio (new site)', timeZone: 'Europe/Amsterdam', currencyCode: 'EUR' },
        gsc: { siteUrl: 'https://www.designstudio.example/', permissionLevel: 'siteOwner' },
        sections: [
            ['/', 'Design Studio – Brand and web design', 30],
            ['/work', 'Selected work | Design Studio', 12],
            ['/work/northwind-rebrand', 'Northwind rebrand | Design Studio', 5],
            ['/work/oak-and-ivy', 'Oak & Ivy website | Design Studio', 4],
            ['/services', 'Services | Design Studio', 8],
            ['/services/branding', 'Branding | Design Studio', 4],
            ['/services/web-design', 'Web design | Design Studio', 4],
            ['/about', 'About | Design Studio', 5],
            ['/contact', 'Start a project | Design Studio', 6],
        ],
        topicPrefix: '/journal/',
        topics: ['Brand identity checklist', 'Our logo design process', 'How much does a website redesign cost'],
        queries: ['design studio amsterdam', 'brand identity agency', 'logo design process', 'website redesign cost', 'brand identity checklist'],
    },
    {
        key: 'splitexpenses',
        name: 'Split Expenses',
        host: 'splitexpenses.example',
        kind: 'saas',
        shape: 'nearZero',
        audience: 'in',
        usersToday: 4,
        organicShare: 0.3,
        ga: { propertyId: 'properties/412300107', account: 'accounts/198700002', displayName: 'Split Expenses app', timeZone: 'Asia/Kolkata', currencyCode: 'INR' },
        gsc: { siteUrl: 'sc-domain:splitexpenses.example', permissionLevel: 'siteOwner' },
        sections: [
            ['/', 'Split Expenses – Share costs with friends', 50],
            ['/download', 'Download the app | Split Expenses', 15],
            ['/features', 'Features | Split Expenses', 8],
            ['/faq', 'FAQ | Split Expenses', 5],
            ['/privacy', 'Privacy policy | Split Expenses', 3],
        ],
        topicPrefix: '/blog/',
        topics: ['How to split rent fairly'],
        queries: ['split expenses app', 'split rent fairly', 'trip expense splitter'],
    },
    {
        key: 'creativeprints',
        name: 'Creative Prints',
        host: 'creativeprints.example',
        kind: 'shop',
        shape: 'seasonal',
        audience: 'us',
        usersToday: 1500,
        organicShare: 0.3,
        aov: 64,
        ga: { propertyId: 'properties/412300108', account: 'accounts/198700003', displayName: 'Creative Prints Shop', timeZone: 'America/Denver', currencyCode: 'USD' },
        sections: [
            ['/', 'Creative Prints – Art prints and posters', 20],
            ['/shop', 'Shop all prints | Creative Prints', 10],
            ['/collections/wall-art', 'Wall art | Creative Prints', 7],
            ['/collections/posters', 'Posters | Creative Prints', 6],
            ['/collections/canvas', 'Canvas prints | Creative Prints', 4],
            ['/custom-prints', 'Custom photo prints | Creative Prints', 4],
            ['/cart', 'Your cart | Creative Prints', 6],
            ['/checkout', 'Checkout | Creative Prints', 3],
            ['/checkout/success', 'Thank you for your order | Creative Prints', 0.9],
            ['/gift-cards', 'Gift cards | Creative Prints', 1.2],
            ['/shipping', 'Shipping & returns | Creative Prints', 1],
            ['/faq', 'FAQ | Creative Prints', 0.8],
        ],
        topicPrefix: '/products/',
        topics: [
            'Mountain sunrise print',
            'Botanical line art set',
            'Retro travel poster – Lisbon',
            'Abstract waves canvas',
            'Minimalist city map',
            'Vintage film poster',
            'Watercolor birds print',
            'Night sky star map',
            'Japanese wave woodblock',
            'Desert cactus print',
            'Coffee lover poster',
            'Custom pet portrait',
        ],
        queries: ['art prints', 'wall art', 'posters online', 'canvas prints', 'custom photo prints', 'star map print', 'city map poster', 'botanical prints'],
    },
    {
        key: 'acmedocs',
        name: 'Acme Docs',
        host: 'docs.acmeanalytics.example',
        kind: 'docs',
        shape: 'growing',
        audience: 'us',
        usersToday: 520,
        organicShare: 1,
        gsc: { siteUrl: 'https://docs.acmeanalytics.example/', permissionLevel: 'siteFullUser' },
        sections: [
            ['/', 'Acme Analytics documentation', 10],
            ['/getting-started', 'Getting started | Acme Docs', 9],
            ['/sdk/javascript', 'JavaScript SDK | Acme Docs', 8],
            ['/sdk/python', 'Python SDK | Acme Docs', 5],
            ['/api/events', 'Events API | Acme Docs', 6],
            ['/api/export', 'Export API | Acme Docs', 3],
            ['/self-hosting', 'Self-hosting | Acme Docs', 2],
        ],
        topicPrefix: '/guides/',
        topics: ['Tracking funnels', 'Building cohorts', 'Segment integration', 'Identifying users', 'Sending server-side events'],
        queries: ['acme analytics api', 'acme javascript sdk', 'track events api', 'funnel tracking', 'server side event tracking', 'self hosted product analytics'],
    },
    {
        key: 'recipenest',
        name: 'Recipe Nest',
        host: 'recipenest.example',
        kind: 'recipes',
        shape: 'seasonal',
        audience: 'us',
        usersToday: 3100,
        organicShare: 1,
        gsc: { siteUrl: 'sc-domain:recipenest.example', permissionLevel: 'siteOwner' },
        sections: [
            ['/', 'Recipe Nest – Easy recipes for every day', 8],
            ['/recipes', 'All recipes | Recipe Nest', 3],
            ['/collections/weeknight-dinners', 'Weeknight dinners | Recipe Nest', 2],
        ],
        topicPrefix: '/recipes/',
        topics: [
            'Easy banana bread',
            'Chicken tikka masala',
            'Overnight oats',
            'Sourdough starter',
            'Classic pumpkin pie',
            'Vegan chili',
            'Shakshuka',
            'Pad thai',
            'Lemon garlic salmon',
            'Chocolate chip cookies',
            'French onion soup',
            'Butter chicken',
            'Homemade pizza dough',
            'Roast turkey',
        ],
        queries: ['banana bread recipe', 'chicken tikka masala', 'overnight oats', 'sourdough starter', 'pumpkin pie', 'vegan chili', 'shakshuka', 'pad thai', 'salmon recipe', 'chocolate chip cookies', 'french onion soup', 'butter chicken', 'pizza dough', 'roast turkey'],
    },
    {
        key: 'healthlegacy',
        name: 'Health Insights (old http)',
        host: 'healthinsights.example',
        kind: 'blog',
        shape: 'nearZero',
        audience: 'us',
        usersToday: 1,
        organicShare: 1,
        gsc: { siteUrl: 'http://healthinsights.example/', permissionLevel: 'siteRestrictedUser' },
        sections: [['/', 'Health Insights', 10]],
        topicPrefix: '/articles/',
        topics: ['Intermittent fasting for beginners', 'Vitamin D deficiency symptoms'],
        queries: ['healthinsights', 'intermittent fasting beginners'],
    },
];

const ACCOUNTS: DemoGoogleAccount[] = [
    {
        key: 'main',
        email: 'demo@trafficclaw.example',
        name: 'Demo Owner',
        gaAccounts: [
            { account: 'accounts/198700001', displayName: 'Acme Holdings', siteKeys: ['acme', 'dataviz', 'searchmetrics'] },
            { account: 'accounts/198700002', displayName: 'Side Projects', siteKeys: ['puzzle', 'designstudio', 'splitexpenses'] },
            { account: 'accounts/198700003', displayName: 'Client Sites', siteKeys: ['health', 'creativeprints'] },
        ],
        gscSiteKeys: ['acme', 'health', 'dataviz', 'puzzle', 'searchmetrics', 'designstudio', 'splitexpenses', 'acmedocs', 'recipenest', 'healthlegacy'],
    },
    {
        key: 'alt',
        email: 'demo2@trafficclaw.example',
        name: 'Second Demo User',
        gaAccounts: [
            { account: 'accounts/198700002', displayName: 'Side Projects', siteKeys: ['puzzle'] },
            { account: 'accounts/198700003', displayName: 'Client Sites', siteKeys: ['creativeprints'] },
        ],
        gscSiteKeys: ['puzzle', 'recipenest'],
    },
];

export const DEMO_DEFAULT_ACCOUNT = 'main';

export function getDemoSites(): readonly DemoSite[] {
    return SITES;
}

export function getDemoSite(key: string): DemoSite | undefined {
    return SITES.find(s => s.key === key);
}

export function getDemoAccounts(): readonly DemoGoogleAccount[] {
    return ACCOUNTS;
}

export function getDemoAccount(key: string | null | undefined): DemoGoogleAccount {
    return ACCOUNTS.find(a => a.key === key) || ACCOUNTS[0];
}

/** Accepts 'properties/123', '123' or 'properties/123/...'. */
export function findSiteByPropertyId(propertyId: string): DemoSite | undefined {
    const digits = /(\d+)/.exec(propertyId || '')?.[1];
    if (!digits) return undefined;
    return SITES.find(s => s.ga?.propertyId === `properties/${digits}`);
}

/** Matches an exact GSC siteUrl, tolerating a missing trailing slash. */
export function findSiteBySiteUrl(siteUrl: string): DemoSite | undefined {
    const want = (siteUrl || '').trim();
    const norm = (u: string) => u.replace(/\/+$/, '').toLowerCase();
    return SITES.find(s => s.gsc && norm(s.gsc.siteUrl) === norm(want));
}

/** Whether the account may read this GA4 property / GSC site. */
export function accountCanReadProperty(account: DemoGoogleAccount, site: DemoSite): boolean {
    return account.gaAccounts.some(a => a.siteKeys.includes(site.key));
}

export function accountCanReadSite(account: DemoGoogleAccount, site: DemoSite): boolean {
    return account.gscSiteKeys.includes(site.key);
}

/** Origin (scheme + host) the site is served from. */
export function siteOrigin(site: DemoSite): string {
    if (site.gsc && /^https?:\/\//.test(site.gsc.siteUrl)) {
        return site.gsc.siteUrl.replace(/\/+$/, '');
    }
    return `https://${site.host}`;
}

/** Turns a title into a URL slug. */
export function slugify(title: string): string {
    return title
        .toLowerCase()
        .replace(/[–—]/g, '-')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// ─── Demo OAuth tokens ───
// Access tokens look like 'demo-access:<account>' and refresh tokens like
// 'demo-refresh:<account>'. The fetch shim maps any 'demo-' bearer token to
// the matching demo Google account.

export function demoAccessToken(accountKey: string = DEMO_DEFAULT_ACCOUNT): string {
    return `demo-access:${accountKey}`;
}

export function demoRefreshToken(accountKey: string = DEMO_DEFAULT_ACCOUNT): string {
    return `demo-refresh:${accountKey}`;
}

export function accountKeyFromToken(token: string | null | undefined): string | null {
    if (!token) return null;
    const m = /^demo-(?:access|refresh):([a-z0-9_-]+)$/i.exec(token.trim());
    if (m) return m[1];
    return token.startsWith('demo-') ? DEMO_DEFAULT_ACCOUNT : null;
}

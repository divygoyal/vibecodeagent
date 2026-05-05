import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { isBlockedUrl } from '@/lib/urlValidation';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

interface SchemaIssue {
    severity: 'error' | 'warning' | 'info';
    message: string;
}

interface DetectedSchema {
    type: string;
    raw: unknown;
    issues: SchemaIssue[];
}

interface SchemaAuditResponse {
    url: string;
    schemas: DetectedSchema[];
    coverage: {
        hasOrganization: boolean;
        hasWebsite: boolean;
        hasArticleLike: boolean;
        hasFAQ: boolean;
        hasHowTo: boolean;
        hasProduct: boolean;
        hasBreadcrumb: boolean;
        hasPerson: boolean;
    };
    summary: {
        totalSchemas: number;
        validSchemas: number;
        errorCount: number;
        warningCount: number;
    };
    recommendations: string[];
}

const REQUIRED_FIELDS: Record<string, string[]> = {
    Article: ['headline', 'datePublished', 'author'],
    BlogPosting: ['headline', 'datePublished', 'author'],
    NewsArticle: ['headline', 'datePublished', 'author'],
    TechArticle: ['headline', 'datePublished', 'author'],
    FAQPage: ['mainEntity'],
    HowTo: ['name', 'step'],
    Product: ['name'],
    Organization: ['name'],
    LocalBusiness: ['name', 'address'],
    BreadcrumbList: ['itemListElement'],
    Person: ['name'],
    Recipe: ['name', 'recipeIngredient', 'recipeInstructions'],
    VideoObject: ['name', 'thumbnailUrl', 'uploadDate'],
    Event: ['name', 'startDate', 'location'],
    Review: ['itemReviewed', 'reviewRating', 'author'],
};

function validateSchema(item: Record<string, unknown>): SchemaIssue[] {
    const issues: SchemaIssue[] = [];
    const rawType = item['@type'];
    if (!rawType) {
        issues.push({ severity: 'error', message: 'Missing @type' });
        return issues;
    }
    if (!item['@context']) {
        issues.push({ severity: 'warning', message: 'Missing @context (should be https://schema.org)' });
    }

    const types = Array.isArray(rawType) ? rawType : [rawType];
    for (const type of types) {
        const required = REQUIRED_FIELDS[String(type)];
        if (!required) continue;
        for (const field of required) {
            if (!(field in item) || item[field] === '' || item[field] === null) {
                issues.push({ severity: 'error', message: `${type}: missing required property "${field}"` });
            }
        }
    }

    // FAQPage: mainEntity should be an array of Question
    if (types.includes('FAQPage') && Array.isArray(item.mainEntity)) {
        for (let i = 0; i < (item.mainEntity as unknown[]).length; i++) {
            const q = (item.mainEntity as Record<string, unknown>[])[i];
            if (!q || q['@type'] !== 'Question') {
                issues.push({ severity: 'warning', message: `FAQPage.mainEntity[${i}] should be of type Question` });
            } else if (!q.acceptedAnswer) {
                issues.push({ severity: 'error', message: `FAQPage.mainEntity[${i}] missing acceptedAnswer` });
            }
        }
    }

    return issues;
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { url?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    let target = body.url?.trim();
    if (!target) return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
    if (isBlockedUrl(target)) {
        return NextResponse.json({ error: 'URL is not allowed' }, { status: 400 });
    }

    try {
        const fetchRes = await fetch(target, {
            headers: { 'User-Agent': 'TrafficClawSchemaBot/1.0 (+https://trafficclaw.com)' },
            signal: AbortSignal.timeout(15000),
            redirect: 'follow',
        });
        if (!fetchRes.ok) {
            return NextResponse.json({ error: `Failed to fetch URL: ${fetchRes.status}` }, { status: 502 });
        }
        const html = await fetchRes.text();
        const $ = cheerio.load(html);

        const detected: DetectedSchema[] = [];
        $('script[type="application/ld+json"]').each((_, el) => {
            const raw = $(el).html() || '';
            try {
                const parsed = JSON.parse(raw);
                const items: Array<Record<string, unknown>> = Array.isArray(parsed)
                    ? parsed
                    : parsed['@graph']
                        ? (parsed['@graph'] as Array<Record<string, unknown>>)
                        : [parsed];
                for (const item of items) {
                    if (!item || typeof item !== 'object') continue;
                    const t = item['@type'];
                    const typeLabel = Array.isArray(t) ? t.join(', ') : String(t || 'Unknown');
                    detected.push({
                        type: typeLabel,
                        raw: item,
                        issues: validateSchema(item),
                    });
                }
            } catch {
                detected.push({
                    type: 'Invalid JSON-LD',
                    raw: raw.slice(0, 200),
                    issues: [{ severity: 'error', message: 'JSON-LD failed to parse' }],
                });
            }
        });

        const types = detected.map(d => d.type);
        const has = (re: RegExp) => types.some(t => re.test(t));
        const coverage = {
            hasOrganization: has(/Organization|LocalBusiness|Corporation/),
            hasWebsite: has(/WebSite/),
            hasArticleLike: has(/Article|BlogPosting|NewsArticle|TechArticle/),
            hasFAQ: has(/FAQPage/),
            hasHowTo: has(/HowTo/),
            hasProduct: has(/Product/),
            hasBreadcrumb: has(/BreadcrumbList/),
            hasPerson: has(/Person/),
        };

        const errorCount = detected.reduce((s, d) => s + d.issues.filter(i => i.severity === 'error').length, 0);
        const warningCount = detected.reduce((s, d) => s + d.issues.filter(i => i.severity === 'warning').length, 0);
        const validSchemas = detected.filter(d => d.issues.filter(i => i.severity === 'error').length === 0).length;

        const recommendations: string[] = [];
        if (!coverage.hasOrganization) recommendations.push('Add Organization schema in your global JSON-LD — boosts E-E-A-T and AI citations.');
        if (!coverage.hasFAQ && coverage.hasArticleLike) recommendations.push('Add FAQPage schema below the article body — single biggest AEO win.');
        if (!coverage.hasBreadcrumb) recommendations.push('Add BreadcrumbList schema for richer search results.');
        if (errorCount > 0) recommendations.push(`Fix ${errorCount} JSON-LD validation error${errorCount === 1 ? '' : 's'} — Google may ignore broken schemas.`);
        if (detected.length === 0) recommendations.push('No structured data found. Start with Organization + Article/FAQ schemas.');

        const result: SchemaAuditResponse = {
            url: target,
            schemas: detected,
            coverage,
            summary: {
                totalSchemas: detected.length,
                validSchemas,
                errorCount,
                warningCount,
            },
            recommendations,
        };

        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to audit schema';
        console.error('[schema-audit] Error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

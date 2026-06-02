/**
 * POST /api/report/generate
 *
 * Generates a weekly or monthly PDF analytics report for a given user.
 * Intended to be called from the superadmin panel.
 *
 * Body: { token, githubId, period: 'weekly' | 'monthly', propertyId?, siteUrl? }
 * When propertyId/siteUrl are provided they are used directly.
 * When propertyId is omitted, the first available GA4 property is preferred and the route falls back to Search Console-only mode if none exist.
 * When siteUrl is omitted, the first available GSC site is auto-selected.
 * Returns: PDF file as application/pdf
 */

import { NextResponse } from 'next/server';
import { fetchReportData, computePeriod } from '@/lib/reportDataFetcher';
import { analyzeReportData } from '@/lib/reportAnalysis';
import { synthesizeWithGemini } from '@/lib/reportGeminiSynth';
import { generateReportPdf } from '@/lib/reportPdfGenerate';
import { getValidAccessToken } from '@/lib/googleApi';
import { verifySuperadminToken } from '@/lib/superadminToken';

export const maxDuration = 180;
export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
export async function POST(req: Request) {
    const t0 = Date.now();

    try {
        const body = await req.json();
        const {
            token,
            githubId,
            period: periodType,
            propertyId: explicitPropertyId,
            siteUrl: explicitSiteUrl,
        } = body;

        if (!verifySuperadminToken(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        if (!githubId) {
            return NextResponse.json({ error: 'Missing githubId' }, { status: 400 });
        }

        if (!periodType || !['weekly', 'monthly'].includes(periodType)) {
            return NextResponse.json({ error: 'Invalid period — must be weekly or monthly' }, { status: 400 });
        }

        const encodedId = encodeURIComponent(githubId);
        const oauthRes = await fetch(`${ADMIN_API_URL}/api/users/${encodedId}/oauth/google`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
        });

        if (!oauthRes.ok) {
            return NextResponse.json(
                { error: 'User does not have a connected Google account' },
                { status: 400 }
            );
        }

        const oauthData = await oauthRes.json();
        const accessToken = await getValidAccessToken(oauthData.access_token, oauthData.refresh_token);

        let propertyId = explicitPropertyId as string | undefined;
        let siteUrl = explicitSiteUrl as string | undefined;

        if (propertyId && !siteUrl) {
            return NextResponse.json(
                { error: 'Report requires a Search Console site when a GA4 property is provided.' },
                { status: 400 }
            );
        }

        if (!propertyId || !siteUrl) {
            const profileRes = await fetch(`${ADMIN_API_URL}/api/users/${encodedId}/profile`, {
                headers: { 'X-API-Key': ADMIN_API_KEY },
            });

            if (!profileRes.ok) {
                return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
            }

            const profile = await profileRes.json();
            const googleInventory = profile.google_inventory;

            if (!googleInventory) {
                return NextResponse.json(
                    { error: 'No Google Analytics or Search Console data available for this user' },
                    { status: 400 }
                );
            }

            if (!propertyId) {
                propertyId = googleInventory.ga_properties?.[0]?.property_id;
            }
            if (!siteUrl) {
                siteUrl = googleInventory.gsc_sites?.[0]?.site_url;
            }
        }

        if (!siteUrl) {
            return NextResponse.json(
                { error: 'Report requires a Search Console site. No verified Search Console property is available for this user.' },
                { status: 400 }
            );
        }

        const period = computePeriod(periodType as 'weekly' | 'monthly');

        // Stage 1: Data fetching
        const t1 = Date.now();
        console.log(`[Report] Fetching data for ${githubId} (${periodType}): ${period.startDate} -> ${period.endDate}`);
        const rawData = await fetchReportData(accessToken, propertyId, siteUrl, period);
        console.log(`[Report] Data fetch: ${Date.now() - t1}ms`);

        // Stage 2: Analysis
        const t2 = Date.now();
        console.log(`[Report] Running analysis...`);
        const analysis = analyzeReportData(rawData);
        console.log(`[Report] Analysis: ${Date.now() - t2}ms | ${analysis.criticalAlerts.length} critical alerts, ${analysis.fixPrompts.length} fix prompts, ${analysis.pageGrades.length} page grades, ${analysis.opportunities.length} opportunities`);

        // Stage 3: Gemini synthesis (2 parallel calls with raw data)
        const t3 = Date.now();
        console.log(`[Report] Synthesizing with Google Gen AI (2 parallel calls)...`);
        const gemini = await synthesizeWithGemini(analysis, period, siteUrl || propertyId || '', rawData);
        console.log(`[Report] Gemini synthesis: ${Date.now() - t3}ms`);

        // Stage 4: PDF generation
        const t4 = Date.now();
        console.log(`[Report] Generating PDF...`);
        const pdfBuffer = await generateReportPdf({
            analysis,
            gemini,
            period,
            siteUrl: siteUrl || propertyId || 'your-site',
        });
        console.log(`[Report] PDF generation: ${Date.now() - t4}ms`);
        console.log(`[Report] Total: ${Date.now() - t0}ms | PDF: ${pdfBuffer.length} bytes`);

        const filename = `TrafficClaw_${periodType}_${period.startDate}_${period.endDate}.pdf`;

        const safeBuffer = pdfBuffer.buffer.slice(
            pdfBuffer.byteOffset,
            pdfBuffer.byteOffset + pdfBuffer.byteLength
        ) as ArrayBuffer;
        return new Response(safeBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': pdfBuffer.length.toString(),
            },
        });
    } catch (err: unknown) {
        const error = err as Error;
        console.error(`[Report] Generation failed after ${Date.now() - t0}ms:`, error.message, error.stack);
        return NextResponse.json(
            { error: `Report generation failed: ${error.message}` },
            { status: 500 }
        );
    }
}

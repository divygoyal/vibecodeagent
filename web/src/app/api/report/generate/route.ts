/**
 * POST /api/report/generate
 * 
 * Generates a weekly or monthly PDF analytics report for a given user.
 * Intended to be called from the superadmin panel.
 * 
 * Body: { token, githubId, period: 'weekly' | 'monthly', propertyId?, siteUrl? }
 * When propertyId/siteUrl are provided they are used directly (per-property reports).
 * When omitted the first available GA4 property and GSC site are auto-selected.
 * Returns: PDF file as application/pdf
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { fetchReportData, computePeriod } from '@/lib/reportDataFetcher';
import { analyzeReportData } from '@/lib/reportAnalysis';
import { synthesizeWithGemini } from '@/lib/reportGeminiSynth';
import { generateReportPdf } from '@/lib/reportPdfGenerate';
import { getValidAccessToken } from '@/lib/googleApi';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

function verifyToken(token: string): boolean {
    if (!token) return false;
    const secret = process.env.NEXTAUTH_SECRET || '';
    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [timestamp, hmac] = parts;
    const expectedHmac = crypto.createHmac('sha256', secret).update(timestamp).digest('hex');

    try {
        if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
            return false;
        }
    } catch {
        return false;
    }

    const tokenAge = Date.now() - parseInt(timestamp, 10);
    return !(tokenAge > TOKEN_EXPIRY_MS || tokenAge < 0);
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            token,
            githubId,
            period: periodType,
            propertyId: explicitPropertyId,
            siteUrl: explicitSiteUrl,
        } = body;

        if (!verifyToken(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        if (!githubId) {
            return NextResponse.json({ error: 'Missing githubId' }, { status: 400 });
        }

        if (!periodType || !['weekly', 'monthly'].includes(periodType)) {
            return NextResponse.json({ error: 'Invalid period — must be weekly or monthly' }, { status: 400 });
        }

        // Fetch user's Google OAuth tokens from admin API
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

        // Resolve GA4 property and GSC site — prefer explicit params, fall back to inventory
        let propertyId = explicitPropertyId as string | undefined;
        let siteUrl = explicitSiteUrl as string | undefined;

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

        if (!propertyId || !siteUrl) {
            const missing = [
                !propertyId && 'GA4 property',
                !siteUrl && 'Search Console site',
            ].filter(Boolean).join(' and ');
            return NextResponse.json(
                { error: `Report requires both GA4 and Search Console. Missing: ${missing}` },
                { status: 400 }
            );
        }

        // Compute the date ranges
        const period = computePeriod(periodType as 'weekly' | 'monthly');

        // Fetch all raw data in parallel
        console.log(`[Report] Fetching data for ${githubId} (${periodType}): ${period.startDate} → ${period.endDate}`);
        const rawData = await fetchReportData(
            accessToken,
            propertyId,
            siteUrl,
            period
        );

        // Run the analysis engine
        console.log(`[Report] Running analysis...`);
        const analysis = analyzeReportData(rawData);

        // Send to Gemini for narrative synthesis
        console.log(`[Report] Synthesizing with Gemini...`);
        const gemini = await synthesizeWithGemini(analysis, period, siteUrl || propertyId || '');

        // Generate the PDF
        console.log(`[Report] Generating PDF...`);
        const pdfBuffer = await generateReportPdf({
            analysis,
            gemini,
            period,
            siteUrl: siteUrl || propertyId || 'your-site',
        });

        console.log(`[Report] Done! PDF size: ${pdfBuffer.length} bytes`);

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
        console.error('[Report] Generation failed:', error.message, error.stack);
        return NextResponse.json(
            { error: `Report generation failed: ${error.message}` },
            { status: 500 }
        );
    }
}

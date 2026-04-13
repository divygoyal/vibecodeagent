/**
 * POST /api/report/user-generate
 *
 * User-facing PDF report generation endpoint.
 * Authenticated via NextAuth session (no superadmin token required).
 *
 * Body: { period: 'weekly' | 'monthly', propertyId?, siteUrl }
 * Returns: PDF file as application/pdf
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { getValidAccessToken, fetchGoogleTokensFromDb } from '@/lib/googleApi';
import { fetchReportData, computePeriod } from '@/lib/reportDataFetcher';
import { analyzeReportData } from '@/lib/reportAnalysis';
import { synthesizeWithGemini } from '@/lib/reportGeminiSynth';
import { generateReportPdf } from '@/lib/reportPdfGenerate';

export const maxDuration = 180;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const t0 = Date.now();

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      period: periodType,
      propertyId,
      siteUrl,
    } = body;

    if (!periodType || !['weekly', 'monthly'].includes(periodType)) {
      return NextResponse.json(
        { error: 'Invalid period — must be weekly or monthly' },
        { status: 400 },
      );
    }

    if (propertyId && !siteUrl) {
      return NextResponse.json(
        { error: 'Report requires a Search Console site when a GA4 property is provided.' },
        { status: 400 },
      );
    }

    if (!siteUrl) {
      return NextResponse.json(
        { error: 'Report requires a Search Console site.' },
        { status: 400 },
      );
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id as string;

    // Get Google tokens from JWT first, fall back to admin DB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jwt = await getToken({ req: req as any }) as Record<string, unknown> | null;
    let googleAccess = jwt?.googleAccessToken as string | undefined;
    let googleRefresh = jwt?.googleRefreshToken as string | undefined;

    if (!googleAccess && !googleRefresh) {
      const dbTokens = await fetchGoogleTokensFromDb(userId);
      if (dbTokens) {
        googleAccess = dbTokens.accessToken;
        googleRefresh = dbTokens.refreshToken;
      }
    }

    if (!googleAccess && !googleRefresh) {
      return NextResponse.json(
        { error: 'Google not connected', code: 'GOOGLE_NOT_CONNECTED' },
        { status: 400 },
      );
    }

    const accessToken = await getValidAccessToken(googleAccess, googleRefresh);
    const period = computePeriod(periodType as 'weekly' | 'monthly');

    // Stage 1: Data fetching
    const t1 = Date.now();
    console.log(`[UserReport] Fetching data for ${userId} (${periodType}): ${period.startDate} -> ${period.endDate}`);
    const rawData = await fetchReportData(accessToken, propertyId, siteUrl, period);
    console.log(`[UserReport] Data fetch: ${Date.now() - t1}ms`);

    // Stage 2: Analysis
    const t2 = Date.now();
    const analysis = analyzeReportData(rawData);
    console.log(`[UserReport] Analysis: ${Date.now() - t2}ms | ${analysis.criticalAlerts.length} alerts, ${analysis.pageGrades.length} pages`);

    // Stage 3: Gemini synthesis
    const t3 = Date.now();
    const gemini = await synthesizeWithGemini(analysis, period, siteUrl, rawData);
    console.log(`[UserReport] Gemini synthesis: ${Date.now() - t3}ms`);

    // Stage 4: PDF generation
    const t4 = Date.now();
    const pdfBuffer = await generateReportPdf({
      analysis,
      gemini,
      period,
      siteUrl,
    });
    console.log(`[UserReport] PDF generation: ${Date.now() - t4}ms`);
    console.log(`[UserReport] Total: ${Date.now() - t0}ms | PDF: ${pdfBuffer.length} bytes`);

    const filename = `TrafficClaw_${periodType}_${period.startDate}_${period.endDate}.pdf`;

    const safeBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength,
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
    console.error(`[UserReport] Generation failed after ${Date.now() - t0}ms:`, error.message, error.stack);
    return NextResponse.json(
      { error: `Report generation failed: ${error.message}` },
      { status: 500 },
    );
  }
}

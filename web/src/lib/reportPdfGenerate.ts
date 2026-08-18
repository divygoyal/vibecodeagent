/**
 * Server-side PDF generation wrapper — renders the ReportDocument
 * to a Buffer using @react-pdf/renderer.
 */

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { ReportDocument } from './reportPdfTemplate';
import type { ReportAnalysis } from './reportAnalysis';
import type { GeminiReportOutput } from './reportGeminiSynth';
import type { ReportPeriod } from './reportDataFetcher';

export interface GeneratePdfInput {
    analysis: ReportAnalysis;
    gemini: GeminiReportOutput;
    period: ReportPeriod;
    siteUrl: string;
}

export async function generateReportPdf(input: GeneratePdfInput): Promise<Uint8Array> {
    const doc = React.createElement(ReportDocument, {
        analysis: input.analysis,
        gemini: input.gemini,
        period: input.period,
        siteUrl: input.siteUrl,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return renderToBuffer(doc as any);
}

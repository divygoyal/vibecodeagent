/**
 * Dashboard PDF Export
 *
 * Client-side PDF generation using html2canvas-pro + jsPDF.
 * Captures the rendered dashboard grid (including themed widgets, charts,
 * and branding) as a high-res image and produces a multi-page PDF.
 */

import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { BRAND_NAME } from '@/lib/brand';

// ── Types ──

export interface PDFExportOptions {
  /** Dashboard display name (shown in header/footer) */
  dashboardName: string;
  /** Date range label, e.g. "Last 30 days" */
  dateRangeLabel?: string;
  /** Company name for the header (from theme branding) */
  companyName?: string;
  /** Background color to force behind transparent areas (defaults to zinc-950) */
  backgroundColor?: string;
  /** Paper orientation */
  orientation?: 'portrait' | 'landscape';
  /** Image scale factor (2 = retina, 1 = standard) */
  scale?: number;
  /** Custom filename (without .pdf extension) */
  filename?: string;
}

// ── Constants ──

const DEFAULT_BG = '#09090b'; // zinc-950
const PDF_MARGIN = 10; // mm
const HEADER_HEIGHT = 14; // mm — space for name + date at top of page 1
const FOOTER_HEIGHT = 8; // mm — space for "Page X of Y" + timestamp

// ── Helpers ──

function getTimestamp(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Parse a hex color string (#RRGGBB or #RGB) to [r, g, b]. */
function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Determine if a color is "dark" (for choosing contrasting text). */
function isDark(hex: string): boolean {
  const [r, g, b] = parseHex(hex);
  // Relative luminance approximation
  return r * 0.299 + g * 0.587 + b * 0.114 < 128;
}

/**
 * Temporarily suppress CSS animations and transitions so html2canvas
 * captures a static frame. Returns a cleanup function.
 */
function freezeAnimations(root: HTMLElement): () => void {
  const style = document.createElement('style');
  style.id = 'pdf-export-freeze';
  style.textContent = `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }
  `;
  root.ownerDocument.head.appendChild(style);
  return () => style.remove();
}

// ── Core Export Function ──

/**
 * Export a dashboard DOM element to a branded PDF file.
 *
 * @param element  The DOM node containing the dashboard grid + branding.
 *                 In the editor this is the main grid area div; in the
 *                 public view it is the full page container.
 * @param options  Branding and layout options.
 */
export async function exportDashboardToPDF(
  element: HTMLElement,
  options: PDFExportOptions,
): Promise<void> {
  const {
    dashboardName,
    dateRangeLabel,
    companyName,
    backgroundColor = DEFAULT_BG,
    orientation = 'landscape',
    scale = 2,
    filename,
  } = options;

  const bgColor = backgroundColor || DEFAULT_BG;
  const [bgR, bgG, bgB] = parseHex(bgColor);
  const dark = isDark(bgColor);

  // 1. Freeze animations
  const unfreeze = freezeAnimations(element);

  // 2. Small delay to let the reflow settle
  await new Promise((r) => setTimeout(r, 150));

  try {
    // 3. Capture element as high-res canvas
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: bgColor,
      logging: false,
      // Ignore interactive-only elements that shouldn't appear in the PDF
      ignoreElements: (el) => {
        return el.getAttribute('data-pdf-ignore') === 'true';
      },
    });

    // 4. Create PDF document
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const contentW = pageW - PDF_MARGIN * 2;

    // Scale captured image to fit page width
    const imgW = contentW;
    const imgH = imgW * (canvas.height / canvas.width);

    // Convert canvas to data URL
    const imgData = canvas.toDataURL('image/png');

    // ── Drawing helpers (adapt to light/dark) ──

    const fillBg = () => pdf.setFillColor(bgR, bgG, bgB);
    const titleColor = dark ? [255, 255, 255] : [24, 24, 27]; // white or zinc-900
    const subtitleColor = dark ? [161, 161, 170] : [113, 113, 122]; // zinc-400 or zinc-500
    const footerColor = dark ? [113, 113, 122] : [161, 161, 170]; // zinc-500 or zinc-400

    // 5. Draw header on page 1
    const drawHeader = () => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(titleColor[0], titleColor[1], titleColor[2]);

      // Background strip behind header
      fillBg();
      pdf.rect(0, 0, pageW, HEADER_HEIGHT + PDF_MARGIN, 'F');

      const nameText = companyName
        ? `${companyName} \u2014 ${dashboardName}`
        : dashboardName;
      pdf.text(nameText, PDF_MARGIN, PDF_MARGIN + 6);

      // Date range (right-aligned, smaller)
      if (dateRangeLabel) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(subtitleColor[0], subtitleColor[1], subtitleColor[2]);
        const drWidth = pdf.getTextWidth(dateRangeLabel);
        pdf.text(dateRangeLabel, pageW - PDF_MARGIN - drWidth, PDF_MARGIN + 6);
      }
    };

    // 6. Draw footer on every page
    const drawFooter = (page: number, totalPages: number) => {
      // Footer background
      fillBg();
      pdf.rect(0, pageH - FOOTER_HEIGHT, pageW, FOOTER_HEIGHT, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(footerColor[0], footerColor[1], footerColor[2]);

      const pageText = `Page ${page} of ${totalPages}`;
      pdf.text(pageText, PDF_MARGIN, pageH - 3);

      const stamp = `Generated ${getTimestamp()} \u2014 ${BRAND_NAME}`;
      const stampW = pdf.getTextWidth(stamp);
      pdf.text(stamp, pageW - PDF_MARGIN - stampW, pageH - 3);
    };

    // 7. Pagination
    const firstPageContentStart = PDF_MARGIN + HEADER_HEIGHT;
    const firstPageContentH = pageH - firstPageContentStart - FOOTER_HEIGHT;
    const otherPageContentH = pageH - PDF_MARGIN - FOOTER_HEIGHT;

    // Calculate total pages
    let totalPages = 1;
    {
      let rem = imgH - firstPageContentH;
      while (rem > 0) {
        totalPages++;
        rem -= otherPageContentH;
      }
    }

    let remaining = imgH;
    let ySource = 0; // mm offset consumed
    let page = 1;

    // ── Page 1 ──
    // Fill entire first page with bg
    fillBg();
    pdf.rect(0, 0, pageW, pageH, 'F');

    drawHeader();

    // Place the full image starting at content top; overflow is masked by footer
    pdf.addImage(imgData, 'PNG', PDF_MARGIN, firstPageContentStart, imgW, imgH, undefined, 'FAST');
    drawFooter(1, totalPages);

    const firstSlice = Math.min(remaining, firstPageContentH);
    remaining -= firstSlice;
    ySource += firstSlice;

    // ── Subsequent pages ──
    while (remaining > 0) {
      page++;
      pdf.addPage();

      // Dark/light background
      fillBg();
      pdf.rect(0, 0, pageW, pageH, 'F');

      // Offset image upward so the correct vertical slice is visible
      const imgYOffset = PDF_MARGIN - ySource;
      pdf.addImage(imgData, 'PNG', PDF_MARGIN, imgYOffset, imgW, imgH, undefined, 'FAST');

      // Mask top (above content)
      fillBg();
      pdf.rect(0, 0, pageW, PDF_MARGIN, 'F');

      // Footer (also masks bottom)
      drawFooter(page, totalPages);

      const sliceH = Math.min(remaining, otherPageContentH);
      remaining -= sliceH;
      ySource += sliceH;
    }

    // 8. Save
    const safeName = (filename || dashboardName)
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    pdf.save(`${safeName}.pdf`);
  } finally {
    unfreeze();
  }
}

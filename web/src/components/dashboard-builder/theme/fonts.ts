import { Source_Serif_4 } from 'next/font/google';

/**
 * Serif headings for the Executive and Paper themes (owner decision, round 2). Declared once,
 * preload off: the browser downloads the file only when a themed heading uses it, so dashboards
 * without a serif theme cost 0 bytes.
 */
export const sourceSerif = Source_Serif_4({
    subsets: ['latin'],
    weight: ['600'],
    display: 'swap',
    preload: false,
    variable: '--font-source-serif',
    fallback: ['Georgia', 'Times New Roman', 'serif'],
});

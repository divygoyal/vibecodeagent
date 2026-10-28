/**
 * Google's URL Inspection coverage states in plain words (round 5 polish). `short` fits a table row; `long` explains
 * it; the raw Google text stays available on hover. Unknown states fall back to Google's own text.
 */
export interface CoverageText { short: string; long: string }

const RULES: Array<[RegExp, string, string]> = [
    [/^submitted and indexed/i, 'Indexed', 'Indexed, and listed in your sitemap.'],
    [/^indexed, not submitted/i, 'Indexed, not in sitemap', 'Indexed, but not listed in your sitemap.'],
    [/^indexed, though blocked by robots/i, 'Indexed, robots.txt blocks it', 'Indexed, although robots.txt blocks Google from crawling it.'],
    [/crawled - currently not indexed/i, 'Crawled, left out of Google', 'Google crawled the page but chose not to index it for now.'],
    [/discovered - currently not indexed/i, 'Found, not crawled yet', 'Google knows the URL but has not crawled it yet.'],
    [/unknown to google/i, 'Unknown to Google', 'Google has not found this URL yet.'],
    [/duplicate, google chose different canonical/i, 'Duplicate: Google chose another URL', 'Google treats another URL as the main version and indexes that one instead.'],
    [/duplicate without user-selected canonical/i, 'Duplicate, no canonical set', 'Google sees this as a duplicate of another page; no canonical tag says which one is the main version.'],
    [/alternate page with proper canonical/i, 'Alternate of another page', 'An alternate version of a page whose canonical Google indexes instead.'],
    [/noindex/i, 'Kept out by noindex', "A noindex tag tells Google not to index the page."],
    [/blocked by robots/i, 'Blocked by robots.txt', 'robots.txt blocks Google from crawling the page.'],
    [/page with redirect/i, 'Redirects elsewhere', 'The URL redirects; Google indexes the target instead.'],
    [/redirect error/i, 'Redirect error', 'Google could not follow the redirect (a loop, too long a chain or a bad URL).'],
    [/soft 404/i, 'Looks like an error page', 'The page answers 200 but looks empty or like an error to Google (soft 404).'],
    [/not found \(404\)/i, 'Not found (404)', 'The URL answers 404 Not found.'],
    [/\(401\)/, 'Needs a login (401)', 'Google was asked to log in (401) and could not read the page.'],
    [/\(403\)/, 'Access forbidden (403)', 'The server refused Google (403).'],
    [/server error/i, 'Server error (5xx)', 'The server answered with an error when Google crawled.'],
];

export function coverageText(raw: string | null | undefined): CoverageText | null {
    if (!raw) return null;
    for (const [re, short, long] of RULES) if (re.test(raw)) return { short, long };
    return { short: raw, long: raw };
}

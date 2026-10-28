/**
 * Icon hosts for GA4 browser and operating-system values (round 5, audit item 25). One map for the app lists and
 * the public share page (components/site/TechIcon.tsx). Browsers and systems use the product's own favicon through
 * /api/favicon (Google's s2 service, cached a week); each host below was checked to answer with that product's
 * logo, not its company's (chrome.com is the Chrome logo, google.com would be the "G").
 */
const BROWSER_HOSTS: Record<string, string> = {
    'chrome': 'chrome.com',
    'chrome ios': 'chrome.com',
    'chrome webview': 'chrome.com',
    'android webview': 'android.com',
    'android browser': 'android.com',
    'safari': 'webkit.org',
    'safari (in-app)': 'webkit.org',
    'mobile safari': 'webkit.org',
    'edge': 'microsoftedge.com',
    'microsoft edge': 'microsoftedge.com',
    'firefox': 'firefox.com',
    'mozilla compatible agent': 'firefox.com',
    'samsung internet': 'samsung.com',
    'opera': 'opera.com',
    'opera mini': 'opera.com',
    'brave': 'brave.com',
    'vivaldi': 'vivaldi.com',
    'duckduckgo': 'duckduckgo.com',
    'yabrowser': 'browser.yandex.com',
    'yandex browser': 'browser.yandex.com',
    'uc browser': 'ucweb.com',
    'internet explorer': 'microsoft.com',
    'amazon silk': 'amazon.com',
};

const OS_HOSTS: Record<string, string> = {
    'windows': 'microsoft.com',
    'windows phone': 'microsoft.com',
    'macintosh': 'apple.com',
    'macos': 'apple.com',
    'mac os x': 'apple.com',
    'ios': 'apple.com',
    'ipados': 'apple.com',
    'android': 'android.com',
    'linux': 'kernel.org',
    'ubuntu': 'ubuntu.com',
    'chrome os': 'chromebook.com',
    'chromeos': 'chromebook.com',
};

const key = (v: string) => v.trim().toLowerCase();

export function browserIconHost(name: string): string | null {
    return BROWSER_HOSTS[key(name)] ?? null;
}

export function osIconHost(name: string): string | null {
    return OS_HOSTS[key(name)] ?? null;
}

export type DeviceKind = 'mobile' | 'tablet' | 'tv' | 'desktop';

export function deviceKind(device: string): DeviceKind {
    const d = key(device);
    if (d.includes('mobile') || d === 'smartphone' || d === 'phone') return 'mobile';
    if (d.includes('tablet')) return 'tablet';
    if (d.includes('tv')) return 'tv';
    return 'desktop';
}

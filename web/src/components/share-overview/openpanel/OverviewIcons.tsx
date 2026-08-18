/* eslint-disable @next/next/no-img-element */
'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
    Activity,
    Globe2,
    Link2,
    Mail,
    MessageCircle,
    Monitor,
    MousePointer2,
    Search,
    ShoppingCart,
    Smartphone,
    Tablet,
} from 'lucide-react';

const COUNTRY_CODES: Record<string, string> = {
    'argentina': 'ar',
    'australia': 'au',
    'austria': 'at',
    'bangladesh': 'bd',
    'belgium': 'be',
    'brazil': 'br',
    'canada': 'ca',
    'chile': 'cl',
    'china': 'cn',
    'colombia': 'co',
    'czech republic': 'cz',
    'czechia': 'cz',
    'denmark': 'dk',
    'egypt': 'eg',
    'finland': 'fi',
    'france': 'fr',
    'germany': 'de',
    'greece': 'gr',
    'hong kong': 'hk',
    'hungary': 'hu',
    'india': 'in',
    'indonesia': 'id',
    'ireland': 'ie',
    'israel': 'il',
    'italy': 'it',
    'japan': 'jp',
    'korea (republic)': 'kr',
    'mexico': 'mx',
    'netherlands': 'nl',
    'new zealand': 'nz',
    'nigeria': 'ng',
    'norway': 'no',
    'pakistan': 'pk',
    'peru': 'pe',
    'philippines': 'ph',
    'poland': 'pl',
    'portugal': 'pt',
    'romania': 'ro',
    'russia': 'ru',
    'saudi arabia': 'sa',
    'singapore': 'sg',
    'south africa': 'za',
    'south korea': 'kr',
    'spain': 'es',
    'sweden': 'se',
    'switzerland': 'ch',
    'taiwan': 'tw',
    'thailand': 'th',
    'turkey': 'tr',
    'uae': 'ae',
    'ukraine': 'ua',
    'united kingdom': 'gb',
    'united states': 'us',
    'vietnam': 'vn',
};

const SITE_ALIASES: Record<string, string> = {
    'amazon': 'amazon.com',
    'amazon.com': 'amazon.com',
    'aol': 'aol.com',
    'aol.com': 'aol.com',
    'bitbucket': 'bitbucket.org',
    'bitbucket.org': 'bitbucket.org',
    'bing': 'bing.com',
    'bing.com': 'bing.com',
    'chatgpt': 'chatgpt.com',
    'chatgpt.com': 'chatgpt.com',
    'direct': '',
    'direct / not set': '',
    '(direct)': '',
    '(not set)': '',
    'dribbble': 'dribbble.com',
    'ebay': 'ebay.com',
    'ebay.com': 'ebay.com',
    'facebook': 'facebook.com',
    'facebook.com': 'facebook.com',
    'gitlab': 'gitlab.com',
    'gitlab.com': 'gitlab.com',
    'github': 'github.com',
    'github.com': 'github.com',
    'google': 'google.com',
    'google.com': 'google.com',
    'heroku': 'heroku.com',
    'heroku.com': 'heroku.com',
    'instagram': 'instagram.com',
    'instagram.com': 'instagram.com',
    'linkedin': 'linkedin.com',
    'linkedin.com': 'linkedin.com',
    'openai': 'openai.com',
    'pinterest': 'pinterest.com',
    'pinterest.com': 'pinterest.com',
    'reddit': 'reddit.com',
    'reddit.com': 'reddit.com',
    't.co': 'x.com',
    'twitter': 'x.com',
    'twitter.com': 'x.com',
    'x': 'x.com',
    'x.com': 'x.com',
    'youtube': 'youtube.com',
    'youtube.com': 'youtube.com',
};

const BROWSER_SITES: Record<string, string> = {
    'android webview': 'android.com',
    'brave': 'brave.com',
    'chrome': 'google.com/chrome',
    'chrome webview': 'google.com/chrome',
    'edge': 'microsoft.com/edge',
    'firefox': 'mozilla.org/firefox',
    'internet explorer': 'microsoft.com',
    'opera': 'opera.com',
    'safari': 'apple.com/safari',
    'samsung internet': 'samsung.com',
};

const OS_SITES: Record<string, string> = {
    'android': 'android.com',
    'chrome os': 'google.com/chromebook',
    'ios': 'apple.com/ios',
    'linux': 'ubuntu.com',
    'macos': 'apple.com/macos',
    'windows': 'microsoft.com/windows',
};

const BRAND_SITES: Record<string, string> = {
    'apple': 'apple.com',
    'asus': 'asus.com',
    'dell': 'dell.com',
    'google': 'store.google.com',
    'hp': 'hp.com',
    'huawei': 'huawei.com',
    'lenovo': 'lenovo.com',
    'motorola': 'motorola.com',
    'oneplus': 'oneplus.com',
    'oppo': 'oppo.com',
    'samsung': 'samsung.com',
    'vivo': 'vivo.com',
    'xiaomi': 'mi.com',
};

function normalizeKey(value: string) {
    return value
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '')
        .trim();
}

function buildFaviconTarget(value: string) {
    const normalized = normalizeKey(value);
    if (!normalized) {
        return null;
    }

    if (SITE_ALIASES[normalized] !== undefined) {
        return SITE_ALIASES[normalized] || null;
    }

    if (/\.[a-z]{2,}$/i.test(normalized)) {
        return normalized;
    }

    return null;
}

function buildFaviconUrl(site: string) {
    const target = site.startsWith('http') ? site : `https://${site}`;
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(target)}`;
}

function buildFlagUrl(country: string) {
    const code = COUNTRY_CODES[normalizeKey(country)];
    return code ? `https://flagcdn.com/w40/${code}.png` : null;
}

function IconFrame({
    children,
    title,
    className,
}: {
    children: ReactNode;
    title?: string;
    className?: string;
}) {
    return (
        <span
            title={title}
            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-[2px] ${className || ''}`}
        >
            {children}
        </span>
    );
}

function FallbackIcon({ children, title }: { children: ReactNode; title?: string }) {
    return (
        <IconFrame title={title} className="text-zinc-400">
            {children}
        </IconFrame>
    );
}

function FaviconIcon({
    site,
    title,
    fallback,
}: {
    site: string | null;
    title?: string;
    fallback: ReactNode;
}) {
    const src = useMemo(() => (site ? buildFaviconUrl(site) : null), [site]);
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const broken = Boolean(src && failedSrc === src);

    if (!src || broken) {
        return <FallbackIcon title={title}>{fallback}</FallbackIcon>;
    }

    return (
        <IconFrame title={title}>
            <img
                src={src}
                alt=""
                width={16}
                height={16}
                className="h-full w-full rounded-[2px] object-contain"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setFailedSrc(src)}
            />
        </IconFrame>
    );
}

export function OverviewCountryFlag({ country }: { country: string }) {
    const src = useMemo(() => buildFlagUrl(country), [country]);
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const broken = Boolean(src && failedSrc === src);

    if (!src || broken) {
        return (
            <FallbackIcon title={country}>
                <Globe2 className="h-3 w-3" />
            </FallbackIcon>
        );
    }

    return (
        <IconFrame title={country}>
            <img
                src={src}
                alt=""
                width={16}
                height={16}
                className="h-full w-full rounded-[2px] object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setFailedSrc(src)}
            />
        </IconFrame>
    );
}

function semanticSourceFallback(value: string, column: string) {
    const key = normalizeKey(value);
    if (!key || key === '(not set)' || key === 'direct' || key === 'direct / not set') {
        return <MousePointer2 className="h-3 w-3" />;
    }
    if (column === 'referrer_type' || column === 'utm_medium') {
        if (key.includes('search')) return <Search className="h-3 w-3" />;
        if (key.includes('email')) return <Mail className="h-3 w-3" />;
        if (key.includes('social')) return <Globe2 className="h-3 w-3" />;
    }
    return <Link2 className="h-3 w-3" />;
}

function semanticDeviceFallback(value: string) {
    const key = normalizeKey(value);
    if (key.includes('mobile')) return <Smartphone className="h-3 w-3" />;
    if (key.includes('tablet')) return <Tablet className="h-3 w-3" />;
    return <Monitor className="h-3 w-3" />;
}

function semanticEventFallback(value: string, column: string) {
    const key = normalizeKey(value).replace(/\s+/g, '_');

    if (column === 'link_out' || key.includes('link_out') || key.includes('outbound') || key.includes('share')) {
        return <Link2 className="h-3 w-3" />;
    }
    if (key.includes('search')) {
        return <Search className="h-3 w-3" />;
    }
    if (
        key.includes('message') ||
        key.includes('chat') ||
        key.includes('comment') ||
        key.includes('reply')
    ) {
        return <MessageCircle className="h-3 w-3" />;
    }
    if (
        key.includes('checkout') ||
        key.includes('purchase') ||
        key.includes('order') ||
        key.includes('cart') ||
        key.includes('review')
    ) {
        return <ShoppingCart className="h-3 w-3" />;
    }
    if (key.includes('signup') || key.includes('newsletter') || key.includes('email')) {
        return <Mail className="h-3 w-3" />;
    }
    return <Activity className="h-3 w-3" />;
}

export function OverviewValueIcon({
    column,
    value,
}: {
    column: string;
    value: string;
}) {
    if (column === 'country' || column === 'region' || column === 'city') {
        return <OverviewCountryFlag country={value} />;
    }

    if (column === 'origin') {
        const originSite = buildFaviconTarget(value);
        return <FaviconIcon site={originSite} title={value} fallback={<Globe2 className="h-3 w-3" />} />;
    }

    if (column === 'device') {
        return <FallbackIcon title={value}>{semanticDeviceFallback(value)}</FallbackIcon>;
    }

    if (column === 'browser' || column === 'browser_version') {
        const browserSite = BROWSER_SITES[normalizeKey(value)] || buildFaviconTarget(value);
        return <FaviconIcon site={browserSite} title={value} fallback={<Globe2 className="h-3 w-3" />} />;
    }

    if (column === 'os' || column === 'os_version') {
        const osSite = OS_SITES[normalizeKey(value)] || buildFaviconTarget(value);
        return <FaviconIcon site={osSite} title={value} fallback={<Monitor className="h-3 w-3" />} />;
    }

    if (column === 'brand' || column === 'model') {
        const brandSite = BRAND_SITES[normalizeKey(value)] || buildFaviconTarget(value);
        return <FaviconIcon site={brandSite} title={value} fallback={semanticDeviceFallback(value)} />;
    }

    if (column === 'event' || column === 'events' || column === 'conversions' || column === 'link_out') {
        return <FallbackIcon title={value}>{semanticEventFallback(value, column)}</FallbackIcon>;
    }

    const site = buildFaviconTarget(value);
    return <FaviconIcon site={site} title={value} fallback={semanticSourceFallback(value, column)} />;
}

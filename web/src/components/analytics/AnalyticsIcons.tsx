'use client';

import React from 'react';

// ─── Country flag from country name ───
const COUNTRY_FLAGS: Record<string, string> = {
    'united states': '🇺🇸', 'united kingdom': '🇬🇧', 'india': '🇮🇳', 'germany': '🇩🇪',
    'canada': '🇨🇦', 'australia': '🇦🇺', 'france': '🇫🇷', 'brazil': '🇧🇷', 'japan': '🇯🇵',
    'china': '🇨🇳', 'south korea': '🇰🇷', 'netherlands': '🇳🇱', 'spain': '🇪🇸', 'italy': '🇮🇹',
    'mexico': '🇲🇽', 'russia': '🇷🇺', 'indonesia': '🇮🇩', 'turkey': '🇹🇷', 'sweden': '🇸🇪',
    'poland': '🇵🇱', 'switzerland': '🇨🇭', 'singapore': '🇸🇬', 'uae': '🇦🇪', 'portugal': '🇵🇹',
    'argentina': '🇦🇷', 'colombia': '🇨🇴', 'chile': '🇨🇱', 'czech republic': '🇨🇿',
    'czechia': '🇨🇿', 'norway': '🇳🇴', 'denmark': '🇩🇰', 'finland': '🇫🇮', 'ireland': '🇮🇪',
    'israel': '🇮🇱', 'belgium': '🇧🇪', 'austria': '🇦🇹', 'new zealand': '🇳🇿',
    'philippines': '🇵🇭', 'vietnam': '🇻🇳', 'thailand': '🇹🇭', 'malaysia': '🇲🇾',
    'south africa': '🇿🇦', 'nigeria': '🇳🇬', 'egypt': '🇪🇬', 'pakistan': '🇵🇰',
    'bangladesh': '🇧🇩', 'ukraine': '🇺🇦', 'romania': '🇷🇴', 'hungary': '🇭🇺',
    'greece': '🇬🇷', 'peru': '🇵🇪', 'saudi arabia': '🇸🇦', 'taiwan': '🇹🇼',
    'hong kong': '🇭🇰', '(not set)': '🏳️',
};

export function CountryFlag({ country }: { country: string }) {
    const c = typeof country === 'string' ? country : String(country ?? '');
    const flag = COUNTRY_FLAGS[c.toLowerCase()] || '🏳️';
    return <span className="text-sm" title={c}>{flag}</span>;
}

// ─── Browser icon ───
// Neutral letter tiles: colour is for metrics only (DESIGN 2.8).
function LetterTile({ name }: { name: string }) {
    return (
        <span className="flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-subtle text-[9px] font-semibold text-fg-secondary" title={name}>
            {name.charAt(0).toUpperCase()}
        </span>
    );
}

export function BrowserIcon({ browser }: { browser: string }) {
    const b = typeof browser === 'string' ? browser : String(browser ?? '');
    return <LetterTile name={b} />;
}

// ─── OS icon ───
export function OSIcon({ os }: { os: string }) {
    const o = typeof os === 'string' ? os : String(os ?? '');
    return <LetterTile name={o} />;
}

// ─── Device icon ───
export function DeviceIcon({ device }: { device: string }) {
    const dv = typeof device === 'string' ? device : String(device ?? '');
    const d = dv.toLowerCase();
    const emoji = d.includes('mobile') ? '📱' : d.includes('tablet') ? '📟' : '🖥️';
    return <span className="text-sm" title={dv}>{emoji}</span>;
}

// ─── Referrer icon ───
const REFERRER_ICONS: Record<string, string> = {
    'google': '🔍', 'google.com': '🔍', '(direct)': '🔗', 'github.com': '🐙',
    't.co': '𝕏', 'twitter.com': '𝕏', 'x.com': '𝕏', 'linkedin.com': 'in',
    'facebook.com': 'f', 'youtube.com': '▶', 'reddit.com': '🔴', 'bing.com': '🔎',
    'instagram.com': '📸', 'pinterest.com': '📌', 'perplexity.ai': '🧠',
    'chatgpt.com': '🤖', 'yahoo.com': '!', 'tumblr.com': 't', 'amazon.com': '📦',
    'bitbucket.org': '🪣',
};

export function ReferrerIcon({ referrer }: { referrer: string }) {
    const ref = typeof referrer === 'string' ? referrer : String(referrer ?? '');
    const r = ref.toLowerCase().replace('https://', '').replace('http://', '').replace('www.', '');
    const icon = REFERRER_ICONS[r] || REFERRER_ICONS[r.split('/')[0]] || '🔗';
    return (
        <span className="text-sm w-5 h-5 flex items-center justify-center flex-shrink-0" title={referrer}>
            {icon.length <= 2 ? <span className="text-meta font-semibold text-fg-muted">{icon}</span> : icon}
        </span>
    );
}

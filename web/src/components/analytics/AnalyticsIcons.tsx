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
const BROWSER_COLORS: Record<string, string> = {
    'chrome': 'bg-yellow-500', 'safari': 'bg-blue-500', 'firefox': 'bg-orange-500',
    'edge': 'bg-cyan-500', 'opera': 'bg-red-500', 'samsung internet': 'bg-violet-500',
    'instagram': 'bg-pink-500', 'chrome webview': 'bg-yellow-600', 'brave': 'bg-orange-600',
};

export function BrowserIcon({ browser }: { browser: string }) {
    const b = typeof browser === 'string' ? browser : String(browser ?? '');
    const color = BROWSER_COLORS[b.toLowerCase()] || 'bg-zinc-500';
    return (
        <div className={`w-4 h-4 rounded-sm ${color} flex items-center justify-center flex-shrink-0`} title={b}>
            <span className="text-[8px] text-white font-bold">{b.charAt(0).toUpperCase()}</span>
        </div>
    );
}

// ─── OS icon ───
const OS_COLORS: Record<string, string> = {
    'windows': 'bg-blue-500', 'macos': 'bg-zinc-400', 'ios': 'bg-zinc-400',
    'android': 'bg-green-500', 'linux': 'bg-amber-600', 'chrome os': 'bg-yellow-500',
};

export function OSIcon({ os }: { os: string }) {
    const o = typeof os === 'string' ? os : String(os ?? '');
    const color = OS_COLORS[o.toLowerCase()] || 'bg-zinc-500';
    const icons: Record<string, string> = {
        'windows': '⊞', 'macos': '', 'ios': '', 'android': '🤖', 'linux': '🐧',
    };
    const icon = icons[o.toLowerCase()];
    return (
        <div className={`w-4 h-4 rounded-sm ${color} flex items-center justify-center flex-shrink-0`} title={o}>
            {icon ? <span className="text-[8px]">{icon}</span> :
                <span className="text-[8px] text-white font-bold">{o.charAt(0).toUpperCase()}</span>}
        </div>
    );
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
            {icon.length <= 2 ? <span className="text-xs font-bold text-zinc-400">{icon}</span> : icon}
        </span>
    );
}

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
    const flag = COUNTRY_FLAGS[country.toLowerCase()] || '🏳️';
    return <span className="text-sm" title={country}>{flag}</span>;
}

// ─── Browser icon ───
const BROWSER_COLORS: Record<string, string> = {
    'chrome': 'bg-yellow-500', 'safari': 'bg-blue-500', 'firefox': 'bg-orange-500',
    'edge': 'bg-cyan-500', 'opera': 'bg-red-500', 'samsung internet': 'bg-violet-500',
    'instagram': 'bg-pink-500', 'chrome webview': 'bg-yellow-600', 'brave': 'bg-orange-600',
};

export function BrowserIcon({ browser }: { browser: string }) {
    const color = BROWSER_COLORS[browser.toLowerCase()] || 'bg-zinc-500';
    return (
        <div className={`w-4 h-4 rounded-sm ${color} flex items-center justify-center flex-shrink-0`} title={browser}>
            <span className="text-[8px] text-white font-bold">{browser.charAt(0).toUpperCase()}</span>
        </div>
    );
}

// ─── OS icon ───
const OS_COLORS: Record<string, string> = {
    'windows': 'bg-blue-500', 'macos': 'bg-zinc-400', 'ios': 'bg-zinc-400',
    'android': 'bg-green-500', 'linux': 'bg-amber-600', 'chrome os': 'bg-yellow-500',
};

export function OSIcon({ os }: { os: string }) {
    const color = OS_COLORS[os.toLowerCase()] || 'bg-zinc-500';
    const icons: Record<string, string> = {
        'windows': '⊞', 'macos': '', 'ios': '', 'android': '🤖', 'linux': '🐧',
    };
    const icon = icons[os.toLowerCase()];
    return (
        <div className={`w-4 h-4 rounded-sm ${color} flex items-center justify-center flex-shrink-0`} title={os}>
            {icon ? <span className="text-[8px]">{icon}</span> :
                <span className="text-[8px] text-white font-bold">{os.charAt(0).toUpperCase()}</span>}
        </div>
    );
}

// ─── Device icon ───
export function DeviceIcon({ device }: { device: string }) {
    const d = device.toLowerCase();
    const emoji = d.includes('mobile') ? '📱' : d.includes('tablet') ? '📟' : '🖥️';
    return <span className="text-sm" title={device}>{emoji}</span>;
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
    const r = referrer.toLowerCase().replace('https://', '').replace('http://', '').replace('www.', '');
    const icon = REFERRER_ICONS[r] || REFERRER_ICONS[r.split('/')[0]] || '🔗';
    return (
        <span className="text-sm w-5 h-5 flex items-center justify-center flex-shrink-0" title={referrer}>
            {icon.length <= 2 ? <span className="text-xs font-bold text-zinc-400">{icon}</span> : icon}
        </span>
    );
}

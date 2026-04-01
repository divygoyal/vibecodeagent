'use client';

import React from 'react';

type Orientation = 'horizontal' | 'vertical';

function normalize(value: string) {
    return String(value ?? '').trim().toLowerCase();
}

function buildStripeGradient(colors: string[], orientation: Orientation) {
    const direction = orientation === 'vertical' ? '90deg' : '180deg';
    const segment = 100 / colors.length;
    return `linear-gradient(${direction}, ${colors
        .map((color, index) => {
            const start = Number((index * segment).toFixed(3));
            const end = Number(((index + 1) * segment).toFixed(3));
            return `${color} ${start}% ${end}%`;
        })
        .join(', ')})`;
}

function FlagFrame({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <span className="analytics-flag-chip" title={title}>
            {children}
        </span>
    );
}

function StripeFlag({
    title,
    colors,
    orientation = 'horizontal',
    emblem,
}: {
    title: string;
    colors: string[];
    orientation?: Orientation;
    emblem?: React.ReactNode;
}) {
    return (
        <FlagFrame title={title}>
            <span className="absolute inset-0" style={{ background: buildStripeGradient(colors, orientation) }} />
            {emblem}
        </FlagFrame>
    );
}

function CrossFlag({
    title,
    base,
    cross,
    crossInset = '36%',
    crossWidth = '18%',
}: {
    title: string;
    base: string;
    cross: string;
    crossInset?: string;
    crossWidth?: string;
}) {
    return (
        <FlagFrame title={title}>
            <span className="absolute inset-0" style={{ background: base }} />
            <span className="absolute inset-y-0" style={{ left: crossInset, width: crossWidth, background: cross }} />
            <span className="absolute inset-x-0" style={{ top: '40%', height: '20%', background: cross }} />
        </FlagFrame>
    );
}

const COUNTRY_TO_ISO: Record<string, string> = {
    'united states': 'US',
    'united kingdom': 'GB',
    india: 'IN',
    germany: 'DE',
    canada: 'CA',
    australia: 'AU',
    france: 'FR',
    brazil: 'BR',
    japan: 'JP',
    china: 'CN',
    'south korea': 'KR',
    netherlands: 'NL',
    spain: 'ES',
    italy: 'IT',
    mexico: 'MX',
    russia: 'RU',
    indonesia: 'ID',
    turkey: 'TR',
    sweden: 'SE',
    poland: 'PL',
    switzerland: 'CH',
    singapore: 'SG',
    uae: 'AE',
    'united arab emirates': 'AE',
    portugal: 'PT',
    argentina: 'AR',
    colombia: 'CO',
    chile: 'CL',
    'czech republic': 'CZ',
    czechia: 'CZ',
    norway: 'NO',
    denmark: 'DK',
    finland: 'FI',
    ireland: 'IE',
    israel: 'IL',
    belgium: 'BE',
    austria: 'AT',
    'new zealand': 'NZ',
    philippines: 'PH',
    vietnam: 'VN',
    thailand: 'TH',
    malaysia: 'MY',
    'south africa': 'ZA',
    nigeria: 'NG',
    egypt: 'EG',
    pakistan: 'PK',
    bangladesh: 'BD',
    ukraine: 'UA',
    romania: 'RO',
    hungary: 'HU',
    greece: 'GR',
    peru: 'PE',
    'saudi arabia': 'SA',
    taiwan: 'TW',
    'hong kong': 'HK',
    '(not set)': '--',
};

const HORIZONTAL_FLAGS: Record<string, string[]> = {
    DE: ['#111111', '#cc2a2a', '#f1c44b'],
    RU: ['#ffffff', '#2956c7', '#d64343'],
    NL: ['#b33d3d', '#ffffff', '#3057c7'],
    ES: ['#a81f1f', '#f6c44a', '#a81f1f'],
    AT: ['#d93f3f', '#ffffff', '#d93f3f'],
    PL: ['#ffffff', '#df4b64'],
    UA: ['#2b72d6', '#f0c83c'],
    RO: ['#2142b1', '#f5c342', '#c73e3e'],
    HU: ['#c6373d', '#ffffff', '#3f8f4e'],
    IE: ['#2a9d55', '#ffffff', '#e58d3b'],
    IN: ['#f2a448', '#ffffff', '#23905c'],
    AR: ['#7dc7f2', '#ffffff', '#7dc7f2'],
    CO: ['#f0c742', '#2c58c9', '#cf4444'],
    PE: ['#cf4444', '#ffffff', '#cf4444'],
    TH: ['#b92e39', '#ffffff', '#2d49a9', '#ffffff', '#b92e39'],
    VN: ['#c72929'],
    ID: ['#d64141', '#ffffff'],
    PK: ['#134f30'],
    BD: ['#0b6138'],
    EG: ['#d13d3d', '#ffffff', '#111111'],
    SA: ['#0d6a42'],
    MY: ['#153c9d', '#ffffff', '#d94444'],
    PH: ['#204db3', '#ce4444'],
};

const VERTICAL_FLAGS: Record<string, string[]> = {
    FR: ['#2451c5', '#ffffff', '#d24242'],
    IT: ['#2f8d57', '#ffffff', '#d04343'],
    BE: ['#111111', '#f0c23e', '#d64343'],
    CA: ['#d64a4a', '#ffffff', '#d64a4a'],
    MX: ['#2a8a54', '#ffffff', '#d64343'],
    PT: ['#1d7c4e', '#d64d3f'],
    NG: ['#2d8d58', '#ffffff', '#2d8d58'],
    TR: ['#bf2f3d'],
};

function CountryFlag({ country }: { country: string }) {
    const label = String(country ?? '');
    const code = COUNTRY_TO_ISO[normalize(label)] || normalize(label).slice(0, 2).toUpperCase() || '--';

    if (code === 'US') {
        return (
            <FlagFrame title={label}>
                <span className="absolute inset-0" style={{ background: 'repeating-linear-gradient(180deg, #ffffff 0 10%, #d94242 10% 20%)' }} />
                <span className="absolute left-0 top-0 h-[58%] w-[46%] bg-[#2645a9]" />
            </FlagFrame>
        );
    }

    if (code === 'GB') {
        return (
            <FlagFrame title={label}>
                <span className="absolute inset-0 bg-[#1f4aa8]" />
                <span className="absolute inset-x-0 top-[40%] h-[20%] bg-white" />
                <span className="absolute inset-y-0 left-[38%] w-[24%] bg-white" />
                <span className="absolute inset-x-0 top-[44%] h-[12%] bg-[#ce4040]" />
                <span className="absolute inset-y-0 left-[42%] w-[16%] bg-[#ce4040]" />
            </FlagFrame>
        );
    }

    if (code === 'BR') {
        return (
            <FlagFrame title={label}>
                <span className="absolute inset-0 bg-[#178b54]" />
                <span
                    className="absolute left-1/2 top-1/2 h-[64%] w-[64%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#f3c648]"
                />
                <span className="absolute left-1/2 top-1/2 h-[38%] w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1b4ea7]" />
            </FlagFrame>
        );
    }

    if (code === 'JP') {
        return (
            <FlagFrame title={label}>
                <span className="absolute inset-0 bg-white" />
                <span className="absolute left-1/2 top-1/2 h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d84d4d]" />
            </FlagFrame>
        );
    }

    if (code === 'KR') {
        return (
            <FlagFrame title={label}>
                <span className="absolute inset-0 bg-white" />
                <span className="absolute left-1/2 top-1/2 h-[40%] w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e24b55]" />
                <span className="absolute left-1/2 top-[52%] h-[20%] w-[40%] -translate-x-1/2 rounded-b-full bg-[#3568d3]" />
            </FlagFrame>
        );
    }

    if (code === 'SG') {
        return (
            <FlagFrame title={label}>
                <span className="absolute inset-0" style={{ background: buildStripeGradient(['#d94949', '#ffffff'], 'horizontal') }} />
                <span className="absolute left-[16%] top-[18%] h-[34%] w-[34%] rounded-full bg-white" />
                <span className="absolute left-[22%] top-[18%] h-[34%] w-[34%] rounded-full bg-[#d94949]" />
            </FlagFrame>
        );
    }

    if (code === 'CH') {
        return (
            <FlagFrame title={label}>
                <span className="absolute inset-0 bg-[#d23e3e]" />
                <span className="absolute left-[38%] top-[20%] h-[60%] w-[24%] bg-white" />
                <span className="absolute left-[22%] top-[38%] h-[24%] w-[56%] bg-white" />
            </FlagFrame>
        );
    }

    if (code === 'AE') {
        return (
            <FlagFrame title={label}>
                <span className="absolute inset-y-0 left-0 w-[24%] bg-[#c83d3d]" />
                <span className="absolute inset-y-0 left-[24%] right-0" style={{ background: buildStripeGradient(['#1f8f56', '#ffffff', '#111111'], 'horizontal') }} />
            </FlagFrame>
        );
    }

    if (code === 'SE') return <CrossFlag title={label} base="#2459b7" cross="#f2c544" crossInset="34%" crossWidth="18%" />;
    if (code === 'DK') return <CrossFlag title={label} base="#bf2f3f" cross="#ffffff" crossInset="32%" crossWidth="16%" />;
    if (code === 'FI') return <CrossFlag title={label} base="#ffffff" cross="#2e56b7" crossInset="34%" crossWidth="16%" />;
    if (code === 'NO') return <CrossFlag title={label} base="#c43a43" cross="#ffffff" crossInset="30%" crossWidth="18%" />;

    if (code === 'CN') {
        return (
            <FlagFrame title={label}>
                <span className="absolute inset-0 bg-[#cf3636]" />
                <span className="absolute left-[16%] top-[18%] h-[18%] w-[18%] rounded-full bg-[#f4d14f]" />
            </FlagFrame>
        );
    }

    if (code === 'TW') {
        return (
            <FlagFrame title={label}>
                <span className="absolute inset-0 bg-[#d34141]" />
                <span className="absolute left-0 top-0 h-[54%] w-[44%] bg-[#2253b9]" />
                <span className="absolute left-[12%] top-[12%] h-[14%] w-[14%] rounded-full bg-white" />
            </FlagFrame>
        );
    }

    if (code === 'HK') {
        return (
            <FlagFrame title={label}>
                <span className="absolute inset-0 bg-[#cf3f3f]" />
                <span className="absolute left-1/2 top-1/2 h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
            </FlagFrame>
        );
    }

    if (code === 'TR') {
        return (
            <FlagFrame title={label}>
                <span className="absolute inset-0 bg-[#be3546]" />
                <span className="absolute left-[18%] top-[24%] h-[42%] w-[42%] rounded-full bg-white" />
                <span className="absolute left-[24%] top-[24%] h-[42%] w-[42%] rounded-full bg-[#be3546]" />
            </FlagFrame>
        );
    }

    if (code === 'IL') return <StripeFlag title={label} colors={['#ffffff', '#1f59c6', '#ffffff', '#1f59c6', '#ffffff']} />;
    if (code === 'ZA') return <StripeFlag title={label} colors={['#158f57', '#f3c64b', '#2c58bf', '#d44040']} />;
    if (code === 'AU' || code === 'NZ') return <StripeFlag title={label} colors={['#143c96']} />;

    if (HORIZONTAL_FLAGS[code]) return <StripeFlag title={label} colors={HORIZONTAL_FLAGS[code]} />;
    if (VERTICAL_FLAGS[code]) return <StripeFlag title={label} colors={VERTICAL_FLAGS[code]} orientation="vertical" />;

    return (
        <FlagFrame title={label}>
            <span className="absolute inset-0 analytics-flag-fallback" />
            <span className="relative z-10 text-[9px] font-semibold tracking-[0.14em] text-zinc-200">{code}</span>
        </FlagFrame>
    );
}

function IconBadge({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <span className="analytics-icon-badge" title={title}>
            {children}
        </span>
    );
}

function IconCanvas({
    title,
    children,
    viewBox = '0 0 24 24',
}: {
    title: string;
    children: React.ReactNode;
    viewBox?: string;
}) {
    return (
        <IconBadge title={title}>
            <svg viewBox={viewBox} className="h-[13px] w-[13px]" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                {children}
            </svg>
        </IconBadge>
    );
}

function GoogleGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <path d="M12 4a8 8 0 0 1 5.5 2.2l-2.2 2.1A4.8 4.8 0 0 0 12 7.1a4.9 4.9 0 0 0-4.5 3.2L4.9 8.3A8 8 0 0 1 12 4Z" fill="#4F8EF7" />
            <path d="M7.5 10.3A5 5 0 0 0 7.2 12c0 .6.1 1.2.3 1.7l-2.6 2A8 8 0 0 1 4.1 12c0-1.3.3-2.5.8-3.7l2.6 2Z" fill="#1DB676" />
            <path d="M7.5 13.7A4.9 4.9 0 0 0 12 16.9c1.1 0 2-.3 2.8-.8l2.3 1.8A7.9 7.9 0 0 1 12 20a8 8 0 0 1-7.1-4.3l2.6-2Z" fill="#F4B946" />
            <path d="M19.6 12.2c0 .5-.1 1-.2 1.4-.6 2.8-3.1 4.8-6.3 4.8-2.1 0-3.4-.6-4.6-1.6l2.3-1.8c.4.3 1 .5 1.8.5 1.5 0 2.7-.8 3.1-2h-3.1v-3.3h6.9c.1.4.2 1 .2 1.7v.3Z" fill="#EA4335" />
        </IconCanvas>
    );
}

function ChromeGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <circle cx="12" cy="12" r="9" fill="#F2F4F8" />
            <path d="M12 3a9 9 0 0 1 7.8 4.5H12a4.5 4.5 0 0 0-3.9 2.3L5.3 5A9 9 0 0 1 12 3Z" fill="#EA4335" />
            <path d="M19.8 7.5a9 9 0 0 1-2 10.7l-3.8-6.5A4.5 4.5 0 0 0 12 7.5h7.8Z" fill="#F4B400" />
            <path d="M17.8 18.2A9 9 0 0 1 5.3 5l3.8 6.6A4.5 4.5 0 0 0 12 16.5c.9 0 1.7-.2 2.4-.7l3.4 2.4Z" fill="#34A853" />
            <circle cx="12" cy="12" r="3.2" fill="#4F8EF7" stroke="#EAF1FF" strokeWidth="1.2" />
        </IconCanvas>
    );
}

function SafariGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <circle cx="12" cy="12" r="9" fill="#4F8EF7" />
            <circle cx="12" cy="12" r="6.7" fill="#8FD2FF" opacity="0.45" />
            <path d="M12 6.2l2 4.8-4.8 2 2.8-6.8Z" fill="#FFFFFF" />
            <path d="M12 17.8l-2-4.8 4.8-2-2.8 6.8Z" fill="#FF7B7B" />
        </IconCanvas>
    );
}

function FirefoxGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <defs>
                <linearGradient id="fx-grad" x1="4" y1="4" x2="20" y2="20">
                    <stop offset="0%" stopColor="#9B6CFF" />
                    <stop offset="100%" stopColor="#FF7B30" />
                </linearGradient>
            </defs>
            <path d="M18.8 8.6c-.7-2.8-3.3-4.8-6.3-4.8-2.6 0-4.8 1.4-6 3.6 1 .1 1.8.7 2.3 1.6-.9.2-1.6.9-1.8 1.8A6.6 6.6 0 0 0 5.4 14c0 3.6 2.9 6.2 6.6 6.2 3.5 0 6.4-2.5 6.6-5.9.1-1.6-.5-3.1-1.7-4.2-.5.2-1 .4-1.6.4.6-.4 1.2-1.1 1.5-1.9Z" fill="url(#fx-grad)" />
            <path d="M15.4 13.6c0 2-1.6 3.4-3.8 3.4-2.1 0-3.7-1.3-3.7-3.2 0-.9.4-1.7 1.1-2.3.2 1.4 1.4 2.5 3 2.5 1.3 0 2.5-.8 3-2 .3.4.4 1 .4 1.6Z" fill="#1A1038" opacity="0.35" />
        </IconCanvas>
    );
}

function EdgeGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <path d="M19.2 15.2A7.6 7.6 0 0 1 5 17c1.2.8 2.7 1.2 4.3 1.2 3.3 0 6.1-1.7 6.9-4.1-1.2.5-2.8.6-4.4.1-2.6-.8-4.3-3-4.2-5.3A7.5 7.5 0 0 1 20 12.3c0 1-.3 1.9-.8 2.9Z" fill="#2AC2D8" />
            <path d="M19.2 15.2c-.8 2.2-3.6 3.9-6.9 3.9-3 0-5.7-1.3-7.3-3.3.8-2.5 3.6-4.1 6.8-3.2 1.6.4 3.2.4 4.4-.1-.7 2-2.8 3.4-5.3 3.4 2.7.7 5.8.2 8.3-1.6Z" fill="#3B82F6" />
        </IconCanvas>
    );
}

function OperaGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <ellipse cx="12" cy="12" rx="6.5" ry="8" fill="#E74B4B" />
            <ellipse cx="12" cy="12" rx="3.5" ry="5" fill="#10131A" />
        </IconCanvas>
    );
}

function SamsungGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <circle cx="12" cy="12" r="8.2" fill="#7854F7" />
            <ellipse cx="12" cy="12" rx="5.8" ry="2.6" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx="16.6" cy="12" r="1.3" fill="#FFFFFF" />
        </IconCanvas>
    );
}

function BraveGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <path d="M12 3.5l5.5 1.5 2 4.3-2.2 8.3L12 20.5l-5.3-2.9L4.5 9.3l2-4.3L12 3.5Z" fill="#F5822E" />
            <path d="M9.1 8.7l1.4-1.2h3l1.4 1.2v4.8L12 16l-2.9-2.5V8.7Z" fill="#FFFFFF" opacity="0.92" />
        </IconCanvas>
    );
}

function GithubGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <path d="M12 4.2A7.8 7.8 0 0 0 4.2 12c0 3.2 2 5.9 4.7 7 .3.1.4-.1.4-.3v-1.3c-1.9.4-2.3-.8-2.3-.8-.3-.8-.8-1-1-1.1-.8-.5.1-.5.1-.5.9.1 1.4 1 1.4 1 .8 1.3 2.1 1 2.6.8.1-.6.3-1 .6-1.2-1.5-.2-3.1-.8-3.1-3.6 0-.8.3-1.5.8-2-.1-.2-.4-1 .1-2 0 0 .7-.2 2.1.8.6-.2 1.3-.3 1.9-.3s1.3.1 1.9.3c1.5-1 2.1-.8 2.1-.8.5 1 .2 1.8.1 2 .5.5.8 1.2.8 2 0 2.8-1.7 3.4-3.2 3.6.3.2.6.7.6 1.5v2.2c0 .2.1.4.4.3A7.8 7.8 0 0 0 19.8 12 7.8 7.8 0 0 0 12 4.2Z" fill="#E6EBF5" />
        </IconCanvas>
    );
}

function BingGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <path d="M8.5 4.2v10.4l3.1 1.5 4.7-2.5-3.3-1.7-1.3.7V8.4L8.5 4.2Z" fill="#24B56A" />
        </IconCanvas>
    );
}

function YoutubeGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <rect x="3" y="6.2" width="18" height="11.6" rx="4" fill="#F34A4A" />
            <path d="M10 9.5l5 2.5-5 2.5V9.5Z" fill="white" />
        </IconCanvas>
    );
}

function LinkedInGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4" fill="#2B78F6" />
            <circle cx="8.2" cy="8.2" r="1.3" fill="white" />
            <rect x="7.1" y="10.2" width="2.2" height="6.2" fill="white" />
            <path d="M11.1 10.2h2v.9c.4-.7 1.1-1.2 2.3-1.2 1.9 0 2.8 1.1 2.8 3.2v3.3H16v-3c0-.8-.3-1.4-1.1-1.4-.8 0-1.4.6-1.4 1.6v2.8h-2.4v-6.2Z" fill="white" />
        </IconCanvas>
    );
}

function XGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <path d="M5.3 4.5h3.3l3.4 4.6 4.1-4.6h2.6l-5.4 6.1 5.7 8h-3.3l-3.9-5.3-4.7 5.3H4.7l6-6.8-5.4-7.3Z" fill="#E8EDF6" />
        </IconCanvas>
    );
}

function RedditGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <circle cx="12" cy="12.8" r="6.2" fill="#FF6A45" />
            <circle cx="9.3" cy="12.4" r="1.1" fill="white" />
            <circle cx="14.7" cy="12.4" r="1.1" fill="white" />
            <path d="M9.3 15.2c.8.7 1.7 1 2.7 1 1 0 2-.3 2.7-1" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M13.2 7.2l1-.8 2.1.8" stroke="#FF6A45" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="16.8" cy="7.1" r="1.1" fill="#FF6A45" />
        </IconCanvas>
    );
}

function ChatGptGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <path d="M12 4.5c1.4 0 2.5.8 3.1 1.9 1.5-.1 2.9.8 3.5 2.1.6 1.3.4 2.9-.4 4 0 1.5-.8 2.8-2.1 3.5-1.2.7-2.7.7-3.9 0-1.3.8-3 .8-4.2.1-1.2-.7-2-2-2.1-3.5-.9-1.1-1.1-2.7-.5-4 .6-1.3 2-2.1 3.5-2.1A3.6 3.6 0 0 1 12 4.5Z" stroke="#E7EDF6" strokeWidth="1.35" />
            <path d="M9 7.2l6 3.3M9 16.8l6-3.3M12 4.5v6.8M6.9 9.1l5.1 2.9M12 12l5.1 2.9" stroke="#53E1BA" strokeWidth="1.15" strokeLinecap="round" />
        </IconCanvas>
    );
}

function PerplexityGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <path d="M12 4.5l1.7 3.8 4.1.4-3.1 2.8.9 4-3.6-2.1-3.6 2.1.9-4-3.1-2.8 4.1-.4L12 4.5Z" fill="#53E1BA" />
            <circle cx="12" cy="12" r="1.3" fill="#0F131B" />
        </IconCanvas>
    );
}

function DirectGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <path d="M6 17.5L18 6.5" stroke="#9DC9FF" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M10.3 6.5H18v7.7" stroke="#9DC9FF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </IconCanvas>
    );
}

function WindowsGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <path d="M4.5 5.5l6.6-.9v7.2H4.5V5.5Zm8 6.2V4.4l7-.9v8.2h-7Zm-8 1.3h6.6v7l-6.6-.9v-6.4Zm8 7.1v-7h7V21l-7-.9Z" fill="#61A3FF" />
        </IconCanvas>
    );
}

function AppleGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <path d="M14.1 6.1c.7-.8 1.1-1.8 1-2.8-1 .1-2 .6-2.6 1.3-.6.7-1 1.7-.9 2.7 1 0 1.9-.4 2.5-1.2Z" fill="#E8EDF6" />
            <path d="M16.8 12.5c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.8-1.4-.1-2.7.8-3.4.8-.7 0-1.7-.8-2.8-.8-1.4 0-2.8.8-3.5 2-.7 1.2-.9 3.1-.2 4.8.7 1.7 1.7 3.7 3 3.7.6 0 .9-.4 1.8-.4s1.1.4 1.9.4c1.3 0 2.1-1.7 2.8-3.3.4-.9.5-1.3.6-1.5-.1 0-2.9-1.1-2.9-4.1Z" fill="#E8EDF6" />
        </IconCanvas>
    );
}

function AndroidGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <path d="M8.2 9.3h7.6v6.9a1 1 0 0 1-1 1H9.2a1 1 0 0 1-1-1V9.3Z" fill="#7CE67A" />
            <path d="M9 8c.6-1.3 1.7-2.1 3-2.1 1.3 0 2.4.8 3 2.1H9Z" fill="#7CE67A" />
            <path d="M9.2 6.2L8 4.7m6.8 1.5L16 4.7" stroke="#7CE67A" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="10.2" cy="11.2" r=".8" fill="#0F131B" />
            <circle cx="13.8" cy="11.2" r=".8" fill="#0F131B" />
        </IconCanvas>
    );
}

function LinuxGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <ellipse cx="12" cy="12.8" rx="4.6" ry="6.2" fill="#E8EDF6" />
            <circle cx="10.4" cy="11" r=".8" fill="#0F131B" />
            <circle cx="13.6" cy="11" r=".8" fill="#0F131B" />
            <path d="M12 12.2l1.2 1.2H10.8l1.2-1.2Z" fill="#F5C34B" />
            <path d="M8.4 17.2c1.1 1 2.3 1.5 3.6 1.5s2.5-.5 3.6-1.5" stroke="#0F131B" strokeWidth="1.1" strokeLinecap="round" />
        </IconCanvas>
    );
}

function DesktopGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <rect x="4.5" y="5.4" width="15" height="10.4" rx="2.1" stroke="#9DC9FF" strokeWidth="1.5" />
            <path d="M9 19h6M12 15.8V19" stroke="#9DC9FF" strokeWidth="1.5" strokeLinecap="round" />
        </IconCanvas>
    );
}

function MobileGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <rect x="7.8" y="3.7" width="8.4" height="16.6" rx="2.4" stroke="#61A3FF" strokeWidth="1.5" />
            <circle cx="12" cy="17.4" r=".9" fill="#61A3FF" />
        </IconCanvas>
    );
}

function TabletGlyph({ title }: { title: string }) {
    return (
        <IconCanvas title={title}>
            <rect x="6" y="4.2" width="12" height="15.6" rx="2.2" stroke="#8DC6FF" strokeWidth="1.5" />
            <circle cx="12" cy="16.7" r=".8" fill="#8DC6FF" />
        </IconCanvas>
    );
}

export function BrowserIcon({ browser }: { browser: string }) {
    const value = normalize(browser);
    if (value.includes('safari')) return <SafariGlyph title={browser} />;
    if (value.includes('firefox')) return <FirefoxGlyph title={browser} />;
    if (value.includes('edge')) return <EdgeGlyph title={browser} />;
    if (value.includes('opera')) return <OperaGlyph title={browser} />;
    if (value.includes('samsung')) return <SamsungGlyph title={browser} />;
    if (value.includes('brave')) return <BraveGlyph title={browser} />;
    if (value.includes('chrome')) return <ChromeGlyph title={browser} />;
    return <IconCanvas title={browser}><circle cx="12" cy="12" r="8" stroke="#95A1B8" strokeWidth="1.5" /><path d="M4 12h16M12 4a14 14 0 0 0 0 16M12 4a14 14 0 0 1 0 16" stroke="#95A1B8" strokeWidth="1.2" /></IconCanvas>;
}

export function OSIcon({ os }: { os: string }) {
    const value = normalize(os);
    if (value.includes('windows')) return <WindowsGlyph title={os} />;
    if (value.includes('mac') || value.includes('ios')) return <AppleGlyph title={os} />;
    if (value.includes('android')) return <AndroidGlyph title={os} />;
    if (value.includes('linux')) return <LinuxGlyph title={os} />;
    if (value.includes('chrome os')) return <ChromeGlyph title={os} />;
    return <IconCanvas title={os}><rect x="5" y="5" width="14" height="14" rx="4" stroke="#A8B3C5" strokeWidth="1.5" /></IconCanvas>;
}

export function DeviceIcon({ device }: { device: string }) {
    const value = normalize(device);
    if (value.includes('mobile')) return <MobileGlyph title={device} />;
    if (value.includes('tablet')) return <TabletGlyph title={device} />;
    return <DesktopGlyph title={device} />;
}

export function ChannelIcon({ channel }: { channel: string }) {
    const value = normalize(channel);
    if (value.includes('search')) return <GoogleGlyph title={channel} />;
    if (value.includes('social')) return <LinkedInGlyph title={channel} />;
    if (value.includes('direct')) return <DirectGlyph title={channel} />;
    if (value.includes('referral')) return <GithubGlyph title={channel} />;
    if (value.includes('email')) return <IconCanvas title={channel}><path d="M4.5 7.2h15v9.6h-15V7.2Z" stroke="#8DBDFF" strokeWidth="1.5" /><path d="M5.3 8l6.7 5 6.7-5" stroke="#8DBDFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></IconCanvas>;
    if (value.includes('paid')) return <IconCanvas title={channel}><circle cx="12" cy="12" r="7" stroke="#F4B946" strokeWidth="1.5" /><path d="M8.8 9.4h4.2a1.7 1.7 0 1 1 0 3.4H11a1.7 1.7 0 1 0 0 3.4h4.3M12 8V6.4M12 17.6V16" stroke="#F4B946" strokeWidth="1.4" strokeLinecap="round" /></IconCanvas>;
    return <IconCanvas title={channel}><circle cx="12" cy="12" r="7.5" stroke="#A6B0C1" strokeWidth="1.4" /><path d="M12 6.5v11M6.5 12h11" stroke="#A6B0C1" strokeWidth="1.2" strokeLinecap="round" /></IconCanvas>;
}

export function ReferrerIcon({ referrer }: { referrer: string }) {
    const host = normalize(referrer).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (!host || host === '(direct)') return <DirectGlyph title={referrer} />;
    if (host.includes('google')) return <GoogleGlyph title={referrer} />;
    if (host.includes('bing')) return <BingGlyph title={referrer} />;
    if (host.includes('github')) return <GithubGlyph title={referrer} />;
    if (host.includes('youtube')) return <YoutubeGlyph title={referrer} />;
    if (host.includes('linkedin')) return <LinkedInGlyph title={referrer} />;
    if (host === 'x.com' || host.includes('twitter') || host === 't.co') return <XGlyph title={referrer} />;
    if (host.includes('reddit')) return <RedditGlyph title={referrer} />;
    if (host.includes('chatgpt')) return <ChatGptGlyph title={referrer} />;
    if (host.includes('perplexity')) return <PerplexityGlyph title={referrer} />;
    if (host.includes('yahoo')) return <IconCanvas title={referrer}><path d="M7 5l5 6 5-6h-3l-2 2.8L10 5H7Zm4 7h2v7h-2v-7Z" fill="#A98DFF" /></IconCanvas>;
    return <IconCanvas title={referrer}><path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm5.2 8a5.2 5.2 0 0 1-6.1 5.1 6.5 6.5 0 0 0 1.9-5.1 6.5 6.5 0 0 0-1.9-5.1A5.2 5.2 0 0 1 17.2 12ZM6.8 12a5.2 5.2 0 0 1 6.1-5.1A6.5 6.5 0 0 0 11 12c0 1.9.8 3.8 1.9 5.1A5.2 5.2 0 0 1 6.8 12Z" fill="#8DBDFF" /></IconCanvas>;
}

export { CountryFlag };

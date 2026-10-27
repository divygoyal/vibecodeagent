/**
 * One place that turns raw GA4 traffic-source values into names people read
 * ("(direct)" -> "Direct", "google" -> "Google", "t.co" -> "X") and into the
 * domain whose favicon we show (through /api/favicon). Pure: used by the site
 * pages, the realtime list and the tests (web/tests/siteSources.test.mjs).
 */

export type SourceKind = 'direct' | 'notset' | 'search' | 'ai' | 'social' | 'email' | 'referral' | 'other';

export interface SourceInfo {
    /** What the row shows: "Google", "Direct", "ChatGPT", "medium.com". */
    label: string;
    /** Domain for the favicon, or null (Direct, Not set, plain campaign words). */
    domain: string | null;
    kind: SourceKind;
}

type Known = [label: string, domain: string | null, kind: SourceKind];

/** Exact keys after cleaning (lower case, no protocol, no www./m./l./lm.). */
const KNOWN: Record<string, Known> = {
    google: ['Google', 'google.com', 'search'],
    'google.com': ['Google', 'google.com', 'search'],
    bing: ['Bing', 'bing.com', 'search'],
    'bing.com': ['Bing', 'bing.com', 'search'],
    duckduckgo: ['DuckDuckGo', 'duckduckgo.com', 'search'],
    'duckduckgo.com': ['DuckDuckGo', 'duckduckgo.com', 'search'],
    yahoo: ['Yahoo', 'yahoo.com', 'search'],
    'yahoo.com': ['Yahoo', 'yahoo.com', 'search'],
    'search.yahoo.com': ['Yahoo', 'yahoo.com', 'search'],
    'ecosia.org': ['Ecosia', 'ecosia.org', 'search'],
    ecosia: ['Ecosia', 'ecosia.org', 'search'],
    baidu: ['Baidu', 'baidu.com', 'search'],
    'baidu.com': ['Baidu', 'baidu.com', 'search'],
    yandex: ['Yandex', 'yandex.com', 'search'],
    'yandex.ru': ['Yandex', 'yandex.com', 'search'],
    'yandex.com': ['Yandex', 'yandex.com', 'search'],
    naver: ['Naver', 'naver.com', 'search'],
    'search.naver.com': ['Naver', 'naver.com', 'search'],
    'search.brave.com': ['Brave Search', 'search.brave.com', 'search'],
    brave: ['Brave Search', 'search.brave.com', 'search'],
    'startpage.com': ['Startpage', 'startpage.com', 'search'],
    qwant: ['Qwant', 'qwant.com', 'search'],
    'qwant.com': ['Qwant', 'qwant.com', 'search'],

    'chatgpt.com': ['ChatGPT', 'chatgpt.com', 'ai'],
    'chat.openai.com': ['ChatGPT', 'chatgpt.com', 'ai'],
    chatgpt: ['ChatGPT', 'chatgpt.com', 'ai'],
    'openai.com': ['OpenAI', 'openai.com', 'ai'],
    'perplexity.ai': ['Perplexity', 'perplexity.ai', 'ai'],
    perplexity: ['Perplexity', 'perplexity.ai', 'ai'],
    'claude.ai': ['Claude', 'claude.ai', 'ai'],
    claude: ['Claude', 'claude.ai', 'ai'],
    'anthropic.com': ['Claude', 'claude.ai', 'ai'],
    'gemini.google.com': ['Gemini', 'gemini.google.com', 'ai'],
    'bard.google.com': ['Gemini', 'gemini.google.com', 'ai'],
    gemini: ['Gemini', 'gemini.google.com', 'ai'],
    'copilot.microsoft.com': ['Copilot', 'copilot.microsoft.com', 'ai'],
    copilot: ['Copilot', 'copilot.microsoft.com', 'ai'],
    'you.com': ['You.com', 'you.com', 'ai'],
    'phind.com': ['Phind', 'phind.com', 'ai'],
    'meta.ai': ['Meta AI', 'meta.ai', 'ai'],
    'chat.deepseek.com': ['DeepSeek', 'deepseek.com', 'ai'],
    'deepseek.com': ['DeepSeek', 'deepseek.com', 'ai'],
    'grok.com': ['Grok', 'grok.com', 'ai'],
    'chat.mistral.ai': ['Le Chat', 'mistral.ai', 'ai'],
    'mistral.ai': ['Le Chat', 'mistral.ai', 'ai'],

    't.co': ['X', 'x.com', 'social'],
    'x.com': ['X', 'x.com', 'social'],
    'twitter.com': ['X', 'x.com', 'social'],
    twitter: ['X', 'x.com', 'social'],
    'facebook.com': ['Facebook', 'facebook.com', 'social'],
    facebook: ['Facebook', 'facebook.com', 'social'],
    fb: ['Facebook', 'facebook.com', 'social'],
    'instagram.com': ['Instagram', 'instagram.com', 'social'],
    instagram: ['Instagram', 'instagram.com', 'social'],
    ig: ['Instagram', 'instagram.com', 'social'],
    'linkedin.com': ['LinkedIn', 'linkedin.com', 'social'],
    'lnkd.in': ['LinkedIn', 'linkedin.com', 'social'],
    linkedin: ['LinkedIn', 'linkedin.com', 'social'],
    'reddit.com': ['Reddit', 'reddit.com', 'social'],
    'out.reddit.com': ['Reddit', 'reddit.com', 'social'],
    'old.reddit.com': ['Reddit', 'reddit.com', 'social'],
    reddit: ['Reddit', 'reddit.com', 'social'],
    'youtube.com': ['YouTube', 'youtube.com', 'social'],
    youtube: ['YouTube', 'youtube.com', 'social'],
    'pinterest.com': ['Pinterest', 'pinterest.com', 'social'],
    pinterest: ['Pinterest', 'pinterest.com', 'social'],
    'tiktok.com': ['TikTok', 'tiktok.com', 'social'],
    tiktok: ['TikTok', 'tiktok.com', 'social'],
    'threads.net': ['Threads', 'threads.net', 'social'],
    'bsky.app': ['Bluesky', 'bsky.app', 'social'],
    'mastodon.social': ['Mastodon', 'mastodon.social', 'social'],
    'news.ycombinator.com': ['Hacker News', 'news.ycombinator.com', 'social'],
    'quora.com': ['Quora', 'quora.com', 'social'],
    'discord.com': ['Discord', 'discord.com', 'social'],
    'slack.com': ['Slack', 'slack.com', 'social'],
    'telegram.org': ['Telegram', 'telegram.org', 'social'],
    'web.telegram.org': ['Telegram', 'telegram.org', 'social'],
    'whatsapp.com': ['WhatsApp', 'whatsapp.com', 'social'],

    'producthunt.com': ['Product Hunt', 'producthunt.com', 'referral'],
    'github.com': ['GitHub', 'github.com', 'referral'],
    'medium.com': ['Medium', 'medium.com', 'referral'],
    'substack.com': ['Substack', 'substack.com', 'referral'],
    'g2.com': ['G2', 'g2.com', 'referral'],
    'stackoverflow.com': ['Stack Overflow', 'stackoverflow.com', 'referral'],
    'wikipedia.org': ['Wikipedia', 'wikipedia.org', 'referral'],
    'en.wikipedia.org': ['Wikipedia', 'wikipedia.org', 'referral'],

    newsletter: ['Newsletter', null, 'email'],
    email: ['Email', null, 'email'],
    mailchimp: ['Mailchimp', 'mailchimp.com', 'email'],
    'mail.google.com': ['Gmail', 'mail.google.com', 'email'],
    'outlook.live.com': ['Outlook', 'outlook.live.com', 'email'],
    brevo: ['Brevo', 'brevo.com', 'email'],
    convertkit: ['Kit', 'kit.com', 'email'],
    beehiiv: ['beehiiv', 'beehiiv.com', 'email'],
};

/** Android app referrers GA4 reports as "android-app://<package>". */
const ANDROID_APPS: Record<string, Known> = {
    'com.google.android.googlequicksearchbox': ['Google app', 'google.com', 'search'],
    'com.google.android.gm': ['Gmail', 'mail.google.com', 'email'],
    'com.linkedin.android': ['LinkedIn', 'linkedin.com', 'social'],
    'com.slack': ['Slack', 'slack.com', 'social'],
    'org.telegram.messenger': ['Telegram', 'telegram.org', 'social'],
    'com.reddit.frontpage': ['Reddit', 'reddit.com', 'social'],
};

const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/;

function clean(raw: string): string {
    let s = raw.trim().toLowerCase();
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, (m) => (m === 'android-app://' ? m : ''));
    if (s.startsWith('android-app://')) return s;
    s = s.split('/')[0].split('?')[0].replace(/:\d+$/, '');
    return s.replace(/^(www|m|l|lm|mobile)\./, '');
}

function titleCase(word: string): string {
    return word ? word[0].toUpperCase() + word.slice(1) : word;
}

/** Name, favicon domain and kind for a GA4 `sessionSource` value. */
export function sourceInfo(raw: string | null | undefined): SourceInfo {
    const v = (raw ?? '').trim();
    if (!v || v === '(not set)' || v === '(not provided)') return { label: 'Not set', domain: null, kind: 'notset' };
    if (v === '(direct)' || v === '(none)') return { label: 'Direct', domain: null, kind: 'direct' };
    const key = clean(v);
    if (key.startsWith('android-app://')) {
        const pkg = key.slice('android-app://'.length).split('/')[0];
        const app = ANDROID_APPS[pkg];
        return app ? { label: app[0], domain: app[1], kind: app[2] } : { label: pkg, domain: null, kind: 'other' };
    }
    const known = KNOWN[key];
    if (known) return { label: known[0], domain: known[1], kind: known[2] };
    // google.co.uk, google.de ... (any Google search country domain)
    if (/^google\.[a-z.]{2,6}$/.test(key)) return { label: 'Google', domain: 'google.com', kind: 'search' };
    if (/^bing\.[a-z.]{2,6}$/.test(key)) return { label: 'Bing', domain: 'bing.com', kind: 'search' };
    if (/^[a-z]+\.facebook\.com$/.test(key)) return { label: 'Facebook', domain: 'facebook.com', kind: 'social' };
    if (/^[a-z]+\.wikipedia\.org$/.test(key)) return { label: 'Wikipedia', domain: 'wikipedia.org', kind: 'referral' };
    if (/\.substack\.com$/.test(key)) return { label: key, domain: key, kind: 'referral' };
    if (DOMAIN_RE.test(key)) return { label: key, domain: key, kind: 'referral' };
    // utm_source words ("weekly_digest"): keep the user's own value, just capitalised.
    return { label: titleCase(v), domain: null, kind: 'other' };
}

/** Plain label only. */
export function sourceLabel(raw: string | null | undefined): string {
    return sourceInfo(raw).label;
}

/** Medium names people read ("cpc" -> "paid"). Null hides it. */
export function mediumLabel(raw: string | null | undefined): string | null {
    const v = (raw ?? '').trim().toLowerCase();
    if (!v || v === '(none)' || v === '(not set)') return null;
    if (v === 'cpc' || v === 'ppc' || v === 'paidsearch') return 'paid search';
    if (v === 'paid' || v === 'paid_social' || v === 'paidsocial' || v === 'cpm') return 'paid';
    return v;
}

/** GA4 `sessionSourceMedium` ("google / organic") -> source info + "organic". */
export function sourceMediumInfo(raw: string | null | undefined): SourceInfo & { medium: string | null; text: string } {
    const v = raw ?? '';
    const i = v.lastIndexOf(' / ');
    const source = i >= 0 ? v.slice(0, i) : v;
    const medium = mediumLabel(i >= 0 ? v.slice(i + 3) : null);
    const info = sourceInfo(source);
    // "Direct" never needs "(none)"; referrals do not need "referral" after a domain.
    const showMedium = medium && info.kind !== 'direct' && info.kind !== 'notset' && medium !== 'referral' ? medium : null;
    return { ...info, medium: showMedium, text: showMedium ? `${info.label} · ${showMedium}` : info.label };
}

/** "United States" stays; GA4's "(not set)" reads "Unknown". */
export function geoLabel(raw: string | null | undefined): string {
    const v = (raw ?? '').trim();
    return !v || v === '(not set)' ? 'Unknown' : v;
}

/** "mobile" -> "Mobile", "smart tv" -> "Smart TV". */
export function deviceLabel(raw: string | null | undefined): string {
    const v = (raw ?? '').trim().toLowerCase();
    if (!v || v === '(not set)') return 'Unknown';
    if (v === 'smart tv') return 'Smart TV';
    return titleCase(v);
}

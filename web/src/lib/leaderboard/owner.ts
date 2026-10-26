/** Helpers shared by the signed-in (owner) leaderboard routes. */
import { NextResponse } from 'next/server';
import { isBlockedUrl } from '@/lib/urlValidation';
import { lbAdmin } from './admin';
import { CATEGORIES, MRR_RANGES, OPEN_TO_OPTIONS } from './constants';
import { getLeaderboardUser, type LeaderboardUser } from './session';
import type { MyEntry, OpenTo, PrivacySettings } from './types';

export async function requireUser(): Promise<{ user: LeaderboardUser } | { error: NextResponse }> {
    const user = await getLeaderboardUser();
    if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    return { user };
}

export async function loadMine(userId: string): Promise<MyEntry[]> {
    const res = await lbAdmin<{ entries: MyEntry[] }>(`/api/lb/mine/${encodeURIComponent(userId)}`, { timeoutMs: 15_000 });
    return res.ok && res.data ? res.data.entries : [];
}

export async function findMine(userId: string, entryId: number): Promise<MyEntry | null> {
    return (await loadMine(userId)).find((e) => e.id === entryId) ?? null;
}

export function parseEntryId(raw: string): number | null {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}

const CONTROL_CHARS_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');
const SPAM_TERMS = /(viagra|crypto-?(moon|pump)|free-?bitcoin|adult-?cam|porn-?hub)/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CATEGORY_SET = new Set<string>(CATEGORIES);
const MRR_SET = new Set<string>(MRR_RANGES);
const OPEN_TO_SET = new Set<string>(OPEN_TO_OPTIONS.map((o) => o.value));

function text(value: unknown, max: number): string {
    return typeof value === 'string' ? value.replace(CONTROL_CHARS_RE, ' ').trim().slice(0, max) : '';
}

export interface ProfileFields {
    startup_name?: string;
    description?: string | null;
    category?: string;
    mrr_range?: string;
    twitter_handle?: string | null;
    founder_name?: string | null;
    contact_email?: string | null;
    logo_url?: string | null;
}

export type Cleaned<T> = { ok: true; value: T } | { ok: false; error: string };

/** Validate the editable profile fields. Only keys present in the body are returned. */
export function cleanProfileFields(body: Record<string, unknown>): Cleaned<ProfileFields> {
    const out: ProfileFields = {};
    if ('startup_name' in body) {
        const name = text(body.startup_name, 100);
        if (!name) return { ok: false, error: 'Give the site a name.' };
        out.startup_name = name;
    }
    if ('description' in body) {
        const d = text(body.description, 200);
        if (SPAM_TERMS.test(d)) return { ok: false, error: 'Description rejected by content filter.' };
        out.description = d || null;
    }
    if ('category' in body) out.category = CATEGORY_SET.has(String(body.category)) ? String(body.category) : 'Other';
    if ('mrr_range' in body && MRR_SET.has(String(body.mrr_range))) out.mrr_range = String(body.mrr_range);
    if ('twitter_handle' in body) out.twitter_handle = text(body.twitter_handle, 60).replace(/^@/, '') || null;
    if ('founder_name' in body) out.founder_name = text(body.founder_name, 100) || null;
    if ('contact_email' in body) {
        const email = text(body.contact_email, 255);
        if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'Contact email must be a valid email address.' };
        out.contact_email = email || null;
    }
    if ('logo_url' in body) {
        const raw = text(body.logo_url, 500);
        if (raw) {
            const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
            if (isBlockedUrl(url)) return { ok: false, error: 'Logo URL must be a public http(s) URL.' };
            out.logo_url = url;
        } else {
            out.logo_url = null;
        }
    }
    return { ok: true, value: out };
}

export function cleanOpenTo(raw: unknown): OpenTo[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: OpenTo[] = [];
    for (const v of raw) if (OPEN_TO_SET.has(String(v)) && !out.includes(v as OpenTo)) out.push(v as OpenTo);
    return out;
}

export function cleanPrivacy(raw: unknown): Partial<PrivacySettings> | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    return raw as Partial<PrivacySettings>; // the admin API whitelists keys and values
}

export function digits(id: string | null | undefined): string {
    return (id || '').replace(/[^\d]/g, '');
}

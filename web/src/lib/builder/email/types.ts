/** Shared shapes of the scheduled dashboard email (round 9). */

export type RecipientStatus = 'pending' | 'confirmed' | 'declined' | 'unsubscribed';

export interface RecipientState { status: RecipientStatus; at?: string; confirmSentAt?: string; confirmedAt?: string }

/** What the admin keeps next to the config (admin/dashboard_email.py). */
export interface ScheduleState {
    /** The latest window key already claimed (sent or being sent). */
    claimed?: string;
    recipients?: Record<string, RecipientState>;
    /** UTC day -> emails sent that day for this dashboard. */
    sent?: Record<string, number>;
    last?: { at?: string; ok?: boolean; sent?: number; skipped?: number; error?: string; window?: string };
}

export interface StoredSchedule { config: unknown; state: ScheduleState }

/** One row of the admin's "scheduled" list. */
export interface ScheduleRow {
    dashboardId: string;
    name: string;
    ownerUserId: number;
    ownerIdentifier: string | null;
    ownerEmail: string | null;
    shareToken: string | null;
    schedule: StoredSchedule;
}

export interface EmailMessage {
    to: string;
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
    kind: 'report' | 'confirm' | 'test';
    dashboardId: string;
}

export interface SendResult { ok: boolean; error?: string; messageId?: string }

export interface EmailTransport {
    readonly name: 'brevo' | 'mock';
    send(msg: EmailMessage): Promise<SendResult>;
}

// ── what the email shows ─────────────────────────────────────────────────

export interface DigestKpi {
    label: string;
    value: string;
    /** '▲ 12.4%' style text without arrow, plus how to colour it. */
    delta?: { text: string; dir: 'up' | 'down' | 'flat'; tone: 'good' | 'bad' | 'neutral' };
    /** 'vs previous period' */
    compare?: string;
}

export interface DigestChart {
    title: string;
    /** Absolute URL of the signed PNG. */
    imageUrl: string;
    alt: string;
    width: number;
    height: number;
}

export interface DigestPage { title: string; kpis: DigestKpi[]; charts: DigestChart[] }

export interface DigestModel {
    dashboardName: string;
    /** 'Last 28 days · Oct 1 – Oct 28' */
    rangeLabel: string;
    siteLabel: string;
    pages: DigestPage[];
    viewUrl: string;
    viewKind: 'public' | 'app';
    message: string;
    /** Brand colour of the dashboard (#rrggbb), else the product green. */
    accent: string;
    company?: string;
    scheduleText: string;
}

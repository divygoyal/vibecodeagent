/**
 * Mail transports for the scheduled dashboard email (round 9). Server only.
 *
 * `brevo` is the existing helper (lib/brevo.ts). `mock` never touches the network: it keeps the
 * messages in memory and writes each one as an .html file into TC_EMAIL_OUTBOX_DIR (default
 * <tmp>/tc-email-outbox). Mock is chosen when TC_EMAIL_TRANSPORT=mock, and ALWAYS in demo-data mode
 * (the worker1 / dev kit), so a test machine can never send a real email even if it had a Brevo key.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sendTransactional } from '@/lib/brevo';
import { demoDataAllowed } from '@/lib/demo/gate';
import type { EmailMessage, EmailTransport, SendResult } from './types';

export const brevoTransport: EmailTransport = {
    name: 'brevo',
    async send(msg: EmailMessage): Promise<SendResult> {
        return sendTransactional({ toEmail: msg.to, subject: msg.subject, htmlContent: msg.html, textContent: msg.text, headers: msg.headers });
    },
};

export interface MockSent extends EmailMessage { file?: string; at: string }

export class MockTransport implements EmailTransport {
    readonly name = 'mock' as const;
    readonly sent: MockSent[] = [];
    constructor(private readonly dir: string | null = null, private readonly failFor: (msg: EmailMessage) => boolean = () => false) {}

    async send(msg: EmailMessage): Promise<SendResult> {
        if (this.failFor(msg)) return { ok: false, error: 'mock failure' };
        let file: string | undefined;
        if (this.dir) {
            try {
                await mkdir(this.dir, { recursive: true });
                const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                const safe = msg.to.replace(/[^a-z0-9@._-]/gi, '_');
                file = join(this.dir, `${stamp}-${msg.kind}-${safe}.html`);
                await writeFile(file, msg.html, 'utf8');
            } catch {
                file = undefined;
            }
        }
        this.sent.push({ ...msg, file, at: new Date().toISOString() });
        return { ok: true, messageId: `mock-${this.sent.length}` };
    }
}

export function isMockMode(env: Record<string, string | undefined> = process.env): boolean {
    return env.TC_EMAIL_TRANSPORT === 'mock' || demoDataAllowed(env);
}

export function outboxDir(env: Record<string, string | undefined> = process.env): string {
    return env.TC_EMAIL_OUTBOX_DIR || join(tmpdir(), 'tc-email-outbox');
}

/** Process-wide mock so repeated requests in mock mode share one outbox listing. */
let sharedMock: MockTransport | null = null;

export function chooseTransport(opts: { dryRun?: boolean } = {}, env: Record<string, string | undefined> = process.env): EmailTransport {
    if (opts.dryRun) return new MockTransport(env.TC_EMAIL_OUTBOX_DIR ? outboxDir(env) : null);
    if (isMockMode(env)) return (sharedMock ??= new MockTransport(outboxDir(env)));
    return brevoTransport;
}

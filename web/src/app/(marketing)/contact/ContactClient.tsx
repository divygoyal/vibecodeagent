'use client';

import { useState } from 'react';
import { CheckCircle2, Mail, Send } from 'lucide-react';

import { Banner, Button } from '@/components/ui';

const FIELD = 'block w-full rounded-control border border-border bg-surface px-3 text-body-lg text-fg shadow-xs placeholder:text-fg-faint transition-[border-color,box-shadow] duration-120 hover:border-border-strong focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-0';
const LABEL = 'mb-1.5 block text-body font-medium text-fg';

/** Contact form: same fields and POST /api/contact as before, restyled. */
export function ContactForm() {
    const [form, setForm] = useState({ name: '', email: '', message: '' });
    const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [sentTo, setSentTo] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('sending');
        setErrorMsg('');
        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setStatus('error');
                setErrorMsg(data.error || 'Something went wrong. Please try again.');
                return;
            }
            setSentTo(form.email);
            setStatus('success');
            setForm({ name: '', email: '', message: '' });
        } catch {
            setStatus('error');
            setErrorMsg('Network error. Please try again.');
        }
    };

    if (status === 'success') {
        return (
            <div role="status" className="rounded-card border border-border-subtle bg-surface p-8 text-center shadow-card">
                <CheckCircle2 aria-hidden size={40} strokeWidth={1.5} className="mx-auto text-up" />
                <h2 className="mt-4 text-title text-fg">Message sent</h2>
                <p className="mt-2 text-body-lg text-fg-secondary">
                    Thanks for reaching out. We&apos;ll reply to <strong className="font-medium text-fg">{sentTo || 'your email'}</strong> soon.
                </p>
                <Button className="mt-6" onClick={() => setStatus('idle')}>Send another message</Button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-card border border-border-subtle bg-surface p-5 shadow-card md:p-6">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <div>
                    <label htmlFor="contact-name" className={LABEL}>Name</label>
                    <input
                        id="contact-name"
                        name="name"
                        type="text"
                        required
                        maxLength={100}
                        autoComplete="name"
                        placeholder="Your name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className={`${FIELD} h-11`}
                    />
                </div>
                <div>
                    <label htmlFor="contact-email" className={LABEL}>Email</label>
                    <input
                        id="contact-email"
                        name="email"
                        type="email"
                        required
                        maxLength={254}
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className={`${FIELD} h-11`}
                    />
                </div>
            </div>
            <div>
                <label htmlFor="contact-message" className={LABEL}>Your question or message</label>
                <textarea
                    id="contact-message"
                    name="message"
                    required
                    rows={6}
                    maxLength={2000}
                    placeholder="How can we help?"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className={`${FIELD} resize-y py-2.5`}
                    aria-describedby="contact-message-count"
                />
                <p id="contact-message-count" className="mt-1 text-right text-meta text-fg-muted tabular-nums">{form.message.length}/2000</p>
            </div>

            {status === 'error' ? <Banner variant="danger">{errorMsg}</Banner> : null}

            <Button type="submit" variant="primary" size="lg" icon={Send} loading={status === 'sending'} className="w-full sm:w-auto">
                {status === 'sending' ? 'Sending…' : 'Send message'}
            </Button>
        </form>
    );
}

export function ContactAlternatives() {
    return (
        <div className="mt-8 flex flex-col gap-3 text-body text-fg-secondary sm:flex-row sm:flex-wrap sm:gap-x-8">
            <p className="inline-flex items-center gap-2">
                <Mail aria-hidden size={16} strokeWidth={1.75} className="text-fg-muted" />
                Prefer email?{' '}
                <a href="mailto:trafficclaw@gmail.com" className="font-medium text-brand-text underline-offset-4 hover:underline">trafficclaw@gmail.com</a>
            </p>
            <p className="inline-flex items-center gap-2">
                <svg aria-hidden className="size-4 text-fg-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                On X:{' '}
                <a href="https://x.com/devdivygoyal" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-text underline-offset-4 hover:underline">@devdivygoyal</a>
            </p>
        </div>
    );
}

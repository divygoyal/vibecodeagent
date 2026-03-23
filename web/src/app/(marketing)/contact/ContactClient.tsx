'use client';

import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import { Send, CheckCircle2, AlertCircle, Mail, MessageSquare, ArrowLeft, Loader2 } from 'lucide-react';

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }
};

const stagger = {
    visible: { transition: { staggerChildren: 0.1 } }
};

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-80px' });
    return (
        <motion.section
            ref={ref}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            variants={stagger}
            className={`relative ${className}`}
        >
            {children}
        </motion.section>
    );
}

export default function ContactClient() {
    const [form, setForm] = useState({ name: '', email: '', message: '' });
    const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

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
            const data = await res.json();

            if (!res.ok) {
                setStatus('error');
                setErrorMsg(data.error || 'Something went wrong.');
                return;
            }

            setStatus('success');
            setForm({ name: '', email: '', message: '' });
        } catch {
            setStatus('error');
            setErrorMsg('Network error. Please try again.');
        }
    };

    return (
        <div className="min-h-screen bg-black text-white">
            <Section className="pt-32 pb-24 px-6">
                <div className="max-w-2xl mx-auto">
                    <motion.div variants={fadeUp}>
                        <Link
                            href="/"
                            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white transition-colors mb-8"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to home
                        </Link>

                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium mb-6 border border-emerald-500/20">
                            <MessageSquare className="w-3 h-3" />
                            GET IN TOUCH
                        </div>

                        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                            Got a{' '}
                            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                                question?
                            </span>
                        </h1>
                        <p className="text-lg text-zinc-400 mb-10">
                            Send us your query and we&apos;ll get back to you as soon as possible. Whether it&apos;s about features, pricing, or just feedback — we&apos;d love to hear from you.
                        </p>
                    </motion.div>

                    {status === 'success' ? (
                        <motion.div
                            variants={fadeUp}
                            className="p-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] text-center"
                        >
                            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-white mb-2">Message sent!</h3>
                            <p className="text-sm text-zinc-400 mb-6">
                                Thanks for reaching out. We&apos;ll get back to you at <strong className="text-white">{form.email || 'your email'}</strong> soon.
                            </p>
                            <button
                                onClick={() => setStatus('idle')}
                                className="px-6 py-2.5 text-sm font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
                            >
                                Send another message
                            </button>
                        </motion.div>
                    ) : (
                        <motion.form
                            variants={fadeUp}
                            onSubmit={handleSubmit}
                            className="space-y-5"
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-zinc-300 mb-2">
                                        Name
                                    </label>
                                    <input
                                        id="name"
                                        type="text"
                                        required
                                        maxLength={100}
                                        placeholder="Your name"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-2">
                                        Email
                                    </label>
                                    <input
                                        id="email"
                                        type="email"
                                        required
                                        maxLength={254}
                                        placeholder="you@example.com"
                                        value={form.email}
                                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="message" className="block text-sm font-medium text-zinc-300 mb-2">
                                    Your question or message
                                </label>
                                <textarea
                                    id="message"
                                    required
                                    rows={5}
                                    maxLength={2000}
                                    placeholder="How can we help you?"
                                    value={form.message}
                                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-colors resize-none"
                                />
                                <div className="text-right mt-1">
                                    <span className="text-xs text-zinc-600">{form.message.length}/2000</span>
                                </div>
                            </div>

                            {status === 'error' && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-sm text-red-400">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {errorMsg}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={status === 'sending'}
                                className="w-full sm:w-auto px-8 py-3 text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                            >
                                {status === 'sending' ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        Send Message
                                    </>
                                )}
                            </button>
                        </motion.form>
                    )}

                    {/* Direct contact options */}
                    <motion.div variants={fadeUp} className="mt-10 pt-8 border-t border-white/[0.06] flex flex-wrap justify-center gap-6">
                        <p className="text-sm text-zinc-500">
                            Prefer email?{' '}
                            <a
                                href="mailto:trafficclaw@gmail.com"
                                className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium inline-flex items-center gap-1"
                            >
                                <Mail className="w-3.5 h-3.5" />
                                trafficclaw@gmail.com
                            </a>
                        </p>
                        <p className="text-sm text-zinc-500">
                            Chat on X?{' '}
                            <a
                                href="https://x.com/devdivygoyal"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium inline-flex items-center gap-1"
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                @devdivygoyal
                            </a>
                        </p>
                    </motion.div>
                </div>
            </Section>
        </div>
    );
}

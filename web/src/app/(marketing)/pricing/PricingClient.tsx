'use client';

import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { CheckCircle2, ArrowRight, Tag, Copy, Check } from 'lucide-react';
import PricingTierCards from '@/components/marketing/pricing/PricingTierCards';

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }
};

const stagger = {
    visible: { transition: { staggerChildren: 0.1 } }
};

const COMPARISON_FEATURES = [
    { name: 'AI Credits', free: '10 total', starter: '50/mo', growth: '150/mo', pro: '300/mo' },
    { name: 'Analytics Dashboard', free: true, starter: true, growth: true, pro: true },
    { name: 'Real-time Globe', free: true, starter: true, growth: true, pro: true },
    { name: 'Embeddable Globe Widget', free: 'With watermark', starter: 'No watermark', growth: 'No watermark', pro: 'No watermark' },
    { name: 'SEO Intelligence', free: true, starter: true, growth: true, pro: true },
    { name: 'Site Audit', free: '1/day', starter: '3/day', growth: '10/day', pro: 'Unlimited' },
    { name: 'AI Chat', free: true, starter: true, growth: true, pro: true },
    { name: 'CSV/JSON Export', free: false, starter: true, growth: true, pro: true },
    { name: 'Multi-site Support', free: false, starter: false, growth: true, pro: true },
    { name: 'Priority AI Responses', free: false, starter: false, growth: true, pro: true },
    { name: 'Telegram Bot (AI SEO Assistant)', free: false, starter: false, growth: false, pro: true },
    { name: 'Custom Alerts', free: false, starter: false, growth: false, pro: true },
    { name: 'Priority Support', free: false, starter: false, growth: false, pro: true },
];

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

function DiscountCallout() {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText('NEWBEE20');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <motion.div
            variants={fadeUp}
            className="max-w-2xl mx-auto p-5 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.08] via-cyan-500/[0.06] to-emerald-500/[0.08]"
        >
            <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Tag className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-white mb-1">New User Discount</h3>
                    <p className="text-sm text-zinc-400">
                        Use code <strong className="text-emerald-400">NEWBEE20</strong> at checkout to get <strong className="text-white">20% off</strong> your first month on any plan.
                    </p>
                </div>
                <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors font-mono font-bold text-emerald-400 text-sm tracking-wider cursor-pointer flex-shrink-0"
                >
                    NEWBEE20
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
            </div>
        </motion.div>
    );
}

export default function PricingClient() {
    return (
        <div className="min-h-screen bg-black text-white">
            {/* Hero */}
            <Section className="pt-32 pb-16 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <motion.div variants={fadeUp}>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium mb-6 border border-emerald-500/20">
                            PRICING
                        </div>
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
                            Simple, transparent{' '}
                            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                                pricing
                            </span>
                        </h1>
                        <p className="text-lg text-zinc-400 max-w-xl mx-auto">
                            Start free with 10 messages. Upgrade when you need more AI power.
                            No hidden fees. Cancel anytime.
                        </p>
                    </motion.div>
                </div>
            </Section>

            {/* Discount Banner */}
            <Section className="pb-8 px-6">
                <DiscountCallout />
            </Section>

            {/* Plan Cards */}
            <Section className="pb-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <PricingTierCards />
                </div>
            </Section>

            {/* Free Tier */}
            <Section className="pb-16 px-6">
                <div className="max-w-3xl mx-auto text-center">
                    <motion.div variants={fadeUp} className="p-8 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                        <h3 className="text-xl font-bold text-white mb-2">Start Free</h3>
                        <p className="text-sm text-zinc-400 mb-4">
                            Get 10 free AI messages when you sign up. No credit card required.
                            Explore the full dashboard, run audits, and see your data.
                        </p>
                        <button
                            onClick={() => signIn('google', { callbackUrl: '/dashboard/analytics' })}
                            className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-semibold rounded-xl hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all text-sm"
                        >
                            Get Started Free <ArrowRight className="w-4 h-4" />
                        </button>
                    </motion.div>
                </div>
            </Section>

            {/* Comparison Table */}
            <Section className="pb-24 px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.div variants={fadeUp} className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-white mb-3">Compare Plans</h2>
                        <p className="text-sm text-zinc-400">See exactly what you get with each plan.</p>
                    </motion.div>

                    <motion.div variants={fadeUp} className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/[0.06]">
                                    <th className="text-left py-4 pr-4 text-zinc-500 font-medium">Feature</th>
                                    <th className="text-center py-4 px-3 text-emerald-400 font-semibold">Free</th>
                                    <th className="text-center py-4 px-3 text-cyan-400 font-semibold">Starter</th>
                                    <th className="text-center py-4 px-3 text-emerald-400 font-semibold">Growth</th>
                                    <th className="text-center py-4 px-3 text-violet-400 font-semibold">Pro</th>
                                </tr>
                            </thead>
                            <tbody>
                                {COMPARISON_FEATURES.map((feature, i) => (
                                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                        <td className="py-3.5 pr-4 text-zinc-300">{feature.name}</td>
                                        {(['free', 'starter', 'growth', 'pro'] as const).map(plan => {
                                            const val = feature[plan];
                                            return (
                                                <td key={plan} className="text-center py-3.5 px-3">
                                                    {typeof val === 'boolean' ? (
                                                        val ? (
                                                            <CheckCircle2 className={`w-4 h-4 mx-auto ${
                                                                plan === 'free' ? 'text-emerald-400' :
                                                                plan === 'starter' ? 'text-cyan-400' :
                                                                plan === 'growth' ? 'text-emerald-400' : 'text-violet-400'
                                                            }`} />
                                                        ) : (
                                                            <span className="text-zinc-700">—</span>
                                                        )
                                                    ) : (
                                                        <span className="text-zinc-300 font-medium text-xs">{val}</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </motion.div>
                </div>
            </Section>

            {/* FAQ */}
            <Section className="pb-24 px-6">
                <div className="max-w-3xl mx-auto">
                    <motion.div variants={fadeUp} className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-white mb-3">Frequently Asked Questions</h2>
                        <p className="text-sm text-zinc-400">Everything you need to know about TrafficClaw pricing.</p>
                    </motion.div>
                    <motion.div variants={fadeUp} className="space-y-4">
                        {[
                            { q: 'Is there a free plan?', a: 'Every new account gets 10 free AI messages to try TrafficClaw. No credit card required. The full analytics dashboard, SEO tools, and site audit are available on all plans.' },
                            { q: 'What happens when I run out of credits?', a: 'You can still access your analytics dashboard, SEO data, and audit tools. AI chat responses require credits. Credits reset at the start of each billing cycle — no rollover.' },
                            { q: 'Can I upgrade or downgrade anytime?', a: 'Yes. You can switch plans at any time. When you upgrade, you get immediate access to the new credit amount. Downgrades take effect at the next billing cycle.' },
                            { q: 'What payment methods do you accept?', a: 'We accept all major credit cards, debit cards, and select digital wallets through our payment provider Dodo Payments. All transactions are encrypted and secure.' },
                            { q: 'Do I need to connect Google Analytics?', a: 'Google Analytics and Search Console connections are optional but recommended. Without them, you can still use site audit, AI SEO tools, and content generation features.' },
                            { q: 'Is my data safe?', a: 'Absolutely. We use OAuth 2.0 for secure authentication, encrypted token storage, and strict data isolation. We never share your data with third parties or use it for AI training. See our Privacy Policy for details.' },
                        ].map((faq, i) => (
                            <details key={i} className="group p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                                <summary className="flex items-center justify-between cursor-pointer text-sm font-semibold text-white list-none">
                                    {faq.q}
                                    <span className="text-zinc-500 group-open:rotate-45 transition-transform text-lg">+</span>
                                </summary>
                                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{faq.a}</p>
                            </details>
                        ))}
                    </motion.div>
                    <div className="text-center mt-8">
                        <a
                            href="mailto:support@trafficclaw.com"
                            className="text-sm text-zinc-400 hover:text-white font-medium transition-colors"
                        >
                            Still have questions? Contact us →
                        </a>
                    </div>
                </div>
            </Section>

            {/* Guarantee */}
            <div className="text-center pb-16 px-6">
                <p className="text-xs text-zinc-500">
                    Secure payments by Dodo Payments • Cancel anytime • No long-term contracts
                </p>
            </div>
        </div>
    );
}

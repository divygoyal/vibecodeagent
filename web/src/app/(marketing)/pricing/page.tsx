'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import {
    Zap, TrendingUp, Shield, CheckCircle2, ArrowRight, X
} from 'lucide-react';

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }
};

const stagger = {
    visible: { transition: { staggerChildren: 0.1 } }
};

const PLANS = [
    {
        key: 'starter',
        name: 'Starter',
        price: '$9',
        credits: 50,
        icon: Zap,
        color: 'cyan',
        gradient: 'from-cyan-400 to-blue-500',
        description: 'Perfect for side projects and personal sites.',
        productId: 'pdt_0NZoVGbK4CoQKguLeiFbO',
        features: [
            { text: '50 AI credits/month', included: true },
            { text: 'Full analytics dashboard', included: true },
            { text: 'SEO tools & audit', included: true },
            { text: 'AI chat assistant', included: true },
            { text: 'CSV & JSON export', included: true },
            { text: 'Telegram bot', included: false },
            { text: 'Priority support', included: false },
        ],
    },
    {
        key: 'growth',
        name: 'Growth',
        price: '$19',
        credits: 150,
        icon: TrendingUp,
        color: 'emerald',
        gradient: 'from-emerald-400 to-cyan-400',
        description: 'For growing businesses serious about SEO.',
        popular: true,
        productId: 'pdt_0NZoVI3aamuRliw0Ffnuh',
        features: [
            { text: '150 AI credits/month', included: true },
            { text: 'Everything in Starter', included: true },
            { text: 'Priority AI responses', included: true },
            { text: 'Advanced SEO intelligence', included: true },
            { text: 'Multi-site support', included: true },
            { text: 'Telegram bot', included: false },
            { text: 'Priority support', included: false },
        ],
    },
    {
        key: 'pro',
        name: 'Pro',
        price: '$29',
        credits: 300,
        icon: Shield,
        color: 'violet',
        gradient: 'from-violet-400 to-purple-500',
        description: 'Everything unlocked. Full power.',
        productId: 'pdt_0NZoVIVgk7pdElblScoop',
        features: [
            { text: '300 AI credits/month', included: true },
            { text: 'Everything in Growth', included: true },
            { text: 'Telegram bot included', included: true },
            { text: 'Priority support', included: true },
            { text: 'Custom alert rules', included: true },
            { text: 'Unlimited audits', included: true },
            { text: 'Early access to features', included: true },
        ],
    },
];

const COMPARISON_FEATURES = [
    { name: 'AI Credits', starter: '50/mo', growth: '150/mo', pro: '300/mo' },
    { name: 'Analytics Dashboard', starter: true, growth: true, pro: true },
    { name: 'SEO Intelligence', starter: true, growth: true, pro: true },
    { name: 'Site Audit', starter: '3/day', growth: '10/day', pro: 'Unlimited' },
    { name: 'AI Chat', starter: true, growth: true, pro: true },
    { name: 'CSV/JSON Export', starter: true, growth: true, pro: true },
    { name: 'Multi-site Support', starter: false, growth: true, pro: true },
    { name: 'Priority AI Responses', starter: false, growth: true, pro: true },
    { name: 'Telegram Bot', starter: false, growth: false, pro: true },
    { name: 'Custom Alerts', starter: false, growth: false, pro: true },
    { name: 'Priority Support', starter: false, growth: false, pro: true },
    { name: 'Early Feature Access', starter: false, growth: false, pro: true },
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

export default function PricingPage() {
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

            {/* Plan Cards */}
            <Section className="pb-24 px-6">
                <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                    {PLANS.map((plan) => {
                        const IconComp = plan.icon;
                        const checkoutUrl = `https://checkout.dodopayments.com/buy/${plan.productId}`;
                        return (
                            <motion.div
                                key={plan.key}
                                variants={fadeUp}
                                className={`relative flex flex-col p-6 rounded-2xl border transition-all group overflow-hidden ${
                                    plan.popular
                                        ? 'bg-gradient-to-b from-emerald-500/[0.08] via-emerald-500/[0.02] to-transparent border-2 border-emerald-500/30'
                                        : plan.key === 'pro'
                                        ? 'bg-gradient-to-b from-violet-500/[0.06] to-transparent border-violet-500/20'
                                        : 'bg-white/[0.02] border-white/[0.06]'
                                }`}
                            >
                                {plan.popular && (
                                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-[9px] font-bold text-black uppercase tracking-wider">
                                        Most Popular
                                    </span>
                                )}

                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br ${plan.gradient}/20`}>
                                    <IconComp className={`w-5 h-5 ${
                                        plan.color === 'emerald' ? 'text-emerald-400' :
                                        plan.color === 'violet' ? 'text-violet-400' : 'text-cyan-400'
                                    }`} />
                                </div>

                                <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                                <p className="text-xs text-zinc-500 mb-4">{plan.description}</p>

                                <div className="flex items-baseline gap-1 mb-1">
                                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                                    <span className="text-sm text-zinc-500">/month</span>
                                </div>
                                <p className={`text-xs font-medium mb-6 ${
                                    plan.color === 'emerald' ? 'text-emerald-400' :
                                    plan.color === 'violet' ? 'text-violet-400' : 'text-cyan-400'
                                }`}>
                                    {plan.credits} AI credits/month
                                </p>

                                <a
                                    href={checkoutUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`w-full py-3 rounded-xl text-sm font-bold text-center block mb-6 transition-all ${
                                        plan.popular
                                            ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-black hover:shadow-[0_0_20px_rgba(52,211,153,0.3)]'
                                            : plan.key === 'pro'
                                            ? 'bg-gradient-to-r from-violet-400 to-purple-500 text-white hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]'
                                            : 'bg-white/[0.06] text-white hover:bg-white/[0.12] border border-white/[0.06]'
                                    }`}
                                >
                                    Get {plan.name}
                                </a>

                                <ul className="space-y-3 flex-1">
                                    {plan.features.map((f, i) => (
                                        <li key={i} className={`flex items-center gap-2.5 text-sm ${f.included ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                            {f.included ? (
                                                <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${
                                                    plan.color === 'emerald' ? 'text-emerald-400' :
                                                    plan.color === 'violet' ? 'text-violet-400' : 'text-cyan-400'
                                                }`} />
                                            ) : (
                                                <X className="w-4 h-4 flex-shrink-0 text-zinc-700" />
                                            )}
                                            {f.text}
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        );
                    })}
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
                            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
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
                                    <th className="text-center py-4 px-4 text-cyan-400 font-semibold">Starter</th>
                                    <th className="text-center py-4 px-4 text-emerald-400 font-semibold">Growth</th>
                                    <th className="text-center py-4 px-4 text-violet-400 font-semibold">Pro</th>
                                </tr>
                            </thead>
                            <tbody>
                                {COMPARISON_FEATURES.map((feature, i) => (
                                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                        <td className="py-3.5 pr-4 text-zinc-300">{feature.name}</td>
                                        {(['starter', 'growth', 'pro'] as const).map(plan => {
                                            const val = feature[plan];
                                            return (
                                                <td key={plan} className="text-center py-3.5 px-4">
                                                    {typeof val === 'boolean' ? (
                                                        val ? (
                                                            <CheckCircle2 className={`w-4 h-4 mx-auto ${
                                                                plan === 'starter' ? 'text-cyan-400' :
                                                                plan === 'growth' ? 'text-emerald-400' : 'text-violet-400'
                                                            }`} />
                                                        ) : (
                                                            <span className="text-zinc-700">—</span>
                                                        )
                                                    ) : (
                                                        <span className="text-zinc-300 font-medium">{val}</span>
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

            {/* FAQ CTA */}
            <Section className="pb-24 px-6">
                <div className="max-w-3xl mx-auto text-center">
                    <motion.div variants={fadeUp}>
                        <p className="text-zinc-400 mb-4">Have questions about pricing?</p>
                        <div className="flex items-center justify-center gap-4">
                            <Link
                                href="/#faq"
                                className="text-sm text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                            >
                                Read our FAQ →
                            </Link>
                            <a
                                href="mailto:support@trafficclaw.com"
                                className="text-sm text-zinc-400 hover:text-white font-medium transition-colors"
                            >
                                Contact us
                            </a>
                        </div>
                    </motion.div>
                </div>
            </Section>

            {/* Guarantee */}
            <div className="text-center pb-16 px-6">
                <p className="text-xs text-zinc-600">
                    Secure payments by Dodo Payments • Cancel anytime • No long-term contracts
                </p>
            </div>
        </div>
    );
}
